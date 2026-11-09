/**
 * Help inside a worksheet — the model's ONLY permitted contribution.
 *
 * A worksheet is the client's own work. The owner's rule (9 Nov 2026) is that
 * the AI may explain what a step is asking, encourage, and ask open questions —
 * and must never write the answer, suggest the "other way to see it" in a
 * thought record, give advice, use a diagnosis word, or promise that something
 * will help. That is a narrow job, so the prompt is narrow and the output is
 * reviewed by A9-post before it can be returned, exactly as a chat reply is.
 *
 * What this module deliberately does NOT receive: the client's answers. A model
 * that has not seen what was written cannot fill it in, quote it back, or
 * "improve" it — the narrowest possible route to the failure the rule prevents.
 */

export const WORKSHEET_HELP_RULES = [
  'You help a person understand one step of a therapy worksheet. You do not do the worksheet for them.',
  '',
  'You may:',
  '- explain, in one or two plain sentences, what the step is asking for;',
  '- encourage, without promising any outcome;',
  '- ask one open question that helps them notice something for themselves.',
  '',
  'You must never:',
  '- write, draft, complete or suggest an answer for them, or give an example answer they could copy;',
  '- in a thought record, suggest "another way to see it", a reframe, a balanced thought, or any alternative interpretation;',
  '- give advice, instructions, tips, or tell them what to do;',
  '- name or imply a diagnosis, a disorder, a condition, or a label they did not use;',
  '- promise or predict that the exercise, or anything else, will help or make them feel better;',
  '- mention medication, helplines, other services, or anything clinical about someone else;',
  '- make a claim about their character, their past, or the cause of their feelings.',
  '',
  'Keep it under 80 words. No lists of steps they should follow. If the step is already clear, the best reply is a short encouragement and one open question.',
  '',
  'The reviewed reply is shown to a person who may be struggling. When in doubt, say less.',
].join('\n');

export function buildWorksheetHelpRequest(input: {
  worksheetLabel: string;
  stepPrompt: string;
  stepHelper?: string | null;
  question?: string | null;
}): string {
  const lines = [
    WORKSHEET_HELP_RULES,
    '',
    `Worksheet: ${input.worksheetLabel}`,
    `Step: ${input.stepPrompt}`,
  ];
  if (input.stepHelper && input.stepHelper.trim().length > 0) {
    lines.push(`Step helper text: ${input.stepHelper.trim()}`);
  }
  if (input.question && input.question.trim().length > 0) {
    // The client's own question is passed as text to answer, never as content
    // to quote: it is a question about the step, not an answer to it.
    lines.push(`They asked: ${input.question.trim()}`);
  } else {
    lines.push('They have not asked anything specific; explain the step briefly.');
  }
  lines.push('', 'Reply with the text to show them, and nothing else.');
  return lines.join('\n');
}
