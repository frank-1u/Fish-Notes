const hashtagName = /#[\p{L}\p{N}_][\p{L}\p{N}_/]*/u;

export const leadingHashtag = new RegExp('^' + hashtagName.source, 'u');
// Capture the whole tag so split() retains it alongside the surrounding prose.
export const inlineHashtagPattern = new RegExp(`(?<=\\s|^)(${hashtagName.source})`, 'gu');
