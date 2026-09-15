export function relevantKeywordMatch(matches:string[],keywords:string[],titleMatches:string[]):boolean {
  return matches.some(match=>match.length>=8) || matches.length>=2 ||
    (keywords.length===1 && titleMatches.includes(keywords[0]) && matches.includes(keywords[0]));
}
