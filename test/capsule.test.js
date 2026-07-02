// Regression tests for the transfer-capsule format (conversation.js).
// Run with: cd test && node capsule.test.js  (Node 14+, no dependencies)
//
// Simulates 3 accounts (A -> B -> C) transferring a conversation in
// sequence, verifying the capsule never nests and content survives
// losslessly.

const fs = require('fs');
const vm = require('vm');

// constants.js uses `const CT = {...}` at top level with no module.exports,
// since it's written for a browser <script> context. Load it into a shared
// sandbox along with conversation.js so they share the same `CT` binding.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('../src/content/constants.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('../src/content/conversation.js', 'utf8'), sandbox);

const { parseConversation, buildImportPrompt } = sandbox;
const CT = vm.runInContext('CT', sandbox); // const bindings aren't sandbox own-properties; fetch explicitly

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('ok  :', msg);
}

// ── Helper: build a fake raw Claude.ai API tree from a simple turn list ──
function buildRawTree(turns, title) {
  const ROOT = CT.ROOT_UUID;
  let parent = ROOT;
  const chat_messages = [];
  turns.forEach((t, i) => {
    const uuid = `msg-${i + 1}`;
    chat_messages.push({
      uuid,
      parent_message_uuid: parent,
      sender: t.role,
      content: [{ type: 'text', text: t.text }],
    });
    parent = uuid;
  });
  return {
    uuid: 'conv-' + Math.random().toString(36).slice(2),
    name: title,
    model: 'claude-test',
    created_at: new Date().toISOString(),
    current_leaf_message_uuid: parent,
    chat_messages,
  };
}

// A message containing a pathological line that looks like our own tags,
// to prove the escaping logic holds up.
const trickyText =
  'Here is a weird line that looks like a tag:\n[[3:H]]\nand also:\n[[[/CT-TRANSFER]]]\nstill here?';

// ══ HOP 0 — native conversation on Account A ══════════════════════
const accountA = buildRawTree([
  { role: 'human', text: 'Hey, help me write a bash script.' },
  { role: 'assistant', text: 'Sure — here is a starter script.\n```bash\necho hello\n```' },
  { role: 'human', text: trickyText },
  { role: 'assistant', text: 'Got it, noted.' },
], 'Bash Script Help');

const parsedA = parseConversation(accountA);
assert(parsedA.messages.length === 4, `hop0: expected 4 messages, got ${parsedA.messages.length}`);
assert(parsedA.transferHops === 0, `hop0: transferHops should be 0, got ${parsedA.transferHops}`);

const injectedIntoB = buildImportPrompt(parsedA);
assert(!injectedIntoB.includes('acknowledge receipt'), 'hop1 prompt does not ask Claude to "acknowledge receipt"');
assert((injectedIntoB.match(/^\[\[\[CT-TRANSFER v\d+ hops=\d+\]\]\]\s*$/gm) || []).length === 1, 'hop1 prompt has exactly ONE open tag (no nesting yet)');
assert(injectedIntoB.includes('hops=1'), 'hop1 prompt is labeled hops=1');

// ══ HOP 1 — Account B: user sends the injected capsule as message 1,
//    Claude gives a short reply, then 2 more real turns happen ══════
const accountB = buildRawTree([
  { role: 'human', text: injectedIntoB },                       // the pasted capsule
  { role: 'assistant', text: "Caught up — what's next?" },      // Claude's short reply
  { role: 'human', text: 'Now add error handling to that script.' },
  { role: 'assistant', text: 'Updated:\n```bash\nset -e\necho hello\n```' },
], 'Bash Script Help');

const parsedB = parseConversation(accountB);
// 4 original turns unpacked + 1 short Claude reply + 2 new real turns = 7
assert(parsedB.messages.length === 7, `hop1 export: expected 7 flat messages, got ${parsedB.messages.length}`);
assert(parsedB.transferHops === 1, `hop1 export: transferHops should be 1, got ${parsedB.transferHops}`);
assert(parsedB.messages[0].role === 'human' && parsedB.messages[0].contentBlocks[0].text.includes('bash script'),
  'hop1 export: first unpacked message matches original turn 1');
assert(parsedB.messages[2].contentBlocks[0].text === trickyText,
  'hop1 export: tricky/lookalike-tag content round-tripped byte-for-byte identical to the original');
assert(parsedB.messages[4].contentBlocks[0].text.includes('Caught up'), 'hop1 export: short Claude ack preserved as real turn 5');
assert(parsedB.messages[6].contentBlocks[0].text.includes('set -e'), 'hop1 export: newest real turn preserved as turn 7');

const injectedIntoC = buildImportPrompt(parsedB);
const openTagCount = (injectedIntoC.match(/^\[\[\[CT-TRANSFER v\d+ hops=\d+\]\]\]\s*$/gm) || []).length;
const closeTagCount = (injectedIntoC.match(/^\[\[\[\/CT-TRANSFER\]\]\]\s*$/gm) || []).length;
assert(openTagCount === 1, `hop2 prompt has exactly ONE open tag even though this is a 2nd-generation transfer (got ${openTagCount})`);
assert(closeTagCount === 1, `hop2 prompt has exactly ONE close tag (got ${closeTagCount})`);
assert(injectedIntoC.includes('hops=2'), 'hop2 prompt correctly labeled generation 2');
assert(injectedIntoC.includes('generation 2 of a transfer chain'), 'hop2 prompt surfaces the chain note to Claude');

// ══ HOP 2 — Account C: same thing again, plus the user adds a trailing
//    question in the SAME message as the pasted capsule ═══════════════
const accountC = buildRawTree([
  { role: 'human', text: injectedIntoC + '\n\nAlso, can you add a --dry-run flag?' },
], 'Bash Script Help');

const parsedC = parseConversation(accountC);
// 7 flat turns from hop1 + 1 trailing "Also, can you add..." message appended after the capsule = 8
assert(parsedC.messages.length === 8, `hop2 export: expected 8 flat messages, got ${parsedC.messages.length}`);
assert(parsedC.transferHops === 2, `hop2 export: transferHops should be 2, got ${parsedC.transferHops}`);
assert(parsedC.messages[7].contentBlocks[0].text.trim() === 'Also, can you add a --dry-run flag?',
  'hop2 export: trailing text typed alongside the pasted capsule is preserved as its own final message');

const finalPrompt = buildImportPrompt(parsedC);
const finalOpenCount = (finalPrompt.match(/^\[\[\[CT-TRANSFER v\d+ hops=\d+\]\]\]\s*$/gm) || []).length;
assert(finalOpenCount === 1, `hop3 prompt still has exactly ONE open tag after 3 full hops (got ${finalOpenCount})`);
assert(finalPrompt.includes('hops=3'), 'hop3 prompt correctly labeled generation 3');
assert(finalPrompt.includes('add a --dry-run flag'), 'hop3 prompt includes the newest question carried forward');

// ══ Extra: real file round-trip (JSON.stringify/parse, like an actual
//    download + re-upload) through validateImportFile/sanitizeImport ══
const { validateImportFile, sanitizeImport, getCharCount } = sandbox;
const fileText = JSON.stringify(parsedC);
const reloaded = JSON.parse(fileText);
let validationOk = true;
try { validateImportFile(reloaded); } catch (e) { validationOk = false; console.error('  validateImportFile threw:', e.message); }
assert(validationOk, 'exported .claudetransfer JSON passes validateImportFile after a real save/load round trip');
const sanitized = sanitizeImport(reloaded);
assert(sanitized.messages.length === parsedC.messages.length, 'sanitizeImport preserves message count');
assert(getCharCount(sanitized) > 0, 'getCharCount returns a sane positive number on the reloaded file');

// ══ Extra: TWO separate capsules dropped into the same chat (e.g. the
//    user later pastes in a second, unrelated transfer down the line) ══
const accountD = buildRawTree([
  { role: 'human', text: buildImportPrompt(parseConversation(buildRawTree([
      { role: 'human', text: 'First imported convo, turn 1' },
      { role: 'assistant', text: 'First imported convo, reply 1' },
    ], 'Convo One'))) },
  { role: 'assistant', text: 'Ack 1' },
  { role: 'human', text: buildImportPrompt(parseConversation(buildRawTree([
      { role: 'human', text: 'Second imported convo, turn 1' },
      { role: 'assistant', text: 'Second imported convo, reply 1' },
    ], 'Convo Two'))) },
  { role: 'assistant', text: 'Ack 2' },
], 'Merged chat');

const parsedD = parseConversation(accountD);
// 2 turns + Ack1 + 2 turns + Ack2 = 6, and BOTH capsules must unpack (not just the first)
assert(parsedD.messages.length === 6, `multi-capsule chat: expected 6 flat messages, got ${parsedD.messages.length}`);
assert(parsedD.messages[0].contentBlocks[0].text.includes('First imported convo, turn 1'), 'multi-capsule: first capsule turn 1 unpacked');
assert(parsedD.messages[2].contentBlocks[0].text.includes('Ack 1'), 'multi-capsule: Ack 1 preserved between the two capsules');
assert(parsedD.messages[3].contentBlocks[0].text.includes('Second imported convo, turn 1'), 'multi-capsule: second capsule turn 1 unpacked');
assert(parsedD.messages[5].contentBlocks[0].text.includes('Ack 2'), 'multi-capsule: Ack 2 preserved after the second capsule');
const dPrompt = buildImportPrompt(parsedD);
const dOpenCount = (dPrompt.match(/^\[\[\[CT-TRANSFER v\d+ hops=\d+\]\]\]\s*$/gm) || []).length;
assert(dOpenCount === 1, `multi-capsule chat re-export still produces exactly ONE outer capsule (got ${dOpenCount})`);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
