export const cases = [
  {
    name: "merge nested immutability",
    question: "Implement this function",
    intent: "implement",
    description:
      "Merge overlapping or touching closed intervals, sorted by start. Return a new array of newly allocated intervals. Input may be empty or unsorted.",
    code: "function mergeIntervals(intervals) {\n  // Do not mutate the original array OR any nested interval.\n  // Examples: [[5,8],[1,3],[3,6]] => [[1,8]]; [] => []\n  // Your solution here\n}",
    reviewCases: [
      "[[5,8],[1,3],[3,6]] -> [[1,8]]",
      "[[-4,-1],[-1,2],[8,9],[8,9]] -> [[-4,2],[8,9]]",
      "Input order and every nested pair remain unchanged; output pairs do not alias input pairs.",
    ],
  },
  {
    name: "unseen merge variation",
    question: "Complete coalesceRanges",
    intent: "implement",
    description:
      "coalesceRanges(ranges) takes unsorted half-open ranges [start,end). Merge strict overlaps ONLY: touching endpoints remain separate. Return ascending starts.",
    code: "function coalesceRanges(ranges) {\n  // Preserve ranges and every inner array unchanged.\n  // [[4,7],[1,4],[2,3]] => [[1,4],[4,7]]\n  // Empty input returns []. Inputs satisfy start < end.\n  // TODO\n}",
    reviewCases: [
      "[[4,7],[1,4],[2,3]] -> [[1,4],[4,7]]",
      "[[0,9],[1,2],[10,11]] -> [[0,9],[10,11]]",
      "Nested arrays and outer ordering unchanged.",
    ],
  },
  {
    name: "latest repeated reference",
    question: "Implement latestPerUser",
    intent: "implement",
    description:
      "Return one original record per user, selecting the greatest numeric timestamp. Output winners in the order of their winning input occurrences.",
    code: "function latestPerUser(records) {\n  // Ties: keep the LATER INPUT OCCURRENCE, not first occurrence of an object.\n  // Do not mutate records or its objects. Empty input returns [].\n  // a and b are DISTINCT objects with userId='u', timestamp=7.\n  // latestPerUser([a,b,a]) must return [a].\n  // Your solution here\n}",
    reviewCases: [
      "[a,b,a], equal user/timestamp -> original a",
      "[u@2, v@5, u@3] -> [v@5, u@3]",
      "[u@9, v@4, u@1] -> [u@9, v@4]",
      "[] -> []; no mutation; no indexOf identity lookup to infer occurrence.",
    ],
  },
  {
    name: "unseen timestamp variation",
    question: "Implement newestByAccount",
    intent: "implement",
    description:
      "Select greatest numeric stamp per account. Return original winning objects in FIRST-SEEN ACCOUNT order, not timestamp or winning-occurrence order.",
    code: "function newestByAccount(events) {\n  // Equal stamp: later occurrence wins, even for repeated references.\n  // Never mutate events or records. Expected linear-time selection.\n  // [a,b,a], same account and stamp, must yield [a].\n  // TODO\n}",
    reviewCases: [
      "[x@1, y@2, x@3] -> [x@3,y@2]",
      "[a,b,a] same account/stamp -> original a",
      "Negative stamps, [] and duplicate references retain required order.",
    ],
  },
  {
    name: "completed code output",
    question: "What does this print?",
    intent: "output",
    description: "Analyze the code exactly as written.",
    code: "function value() { /* no return */ }\nconsole.log('A', value());\nconsole.log('B', [2, 3].reduce((a, b) => a + b, 0));\n// Give both outputs; do not implement value.",
    expectedOutputs: ["undefined", "5"],
  },
  {
    name: "unfinished implement variation",
    question: "Implement this function",
    intent: "implement",
    description:
      "sumEvens(values) returns the sum of all even integers, including negatives. Do not modify values.",
    code: "function sumEvens(values) {\n  // [] => 0; [-4,1,2,8] => 6; [3,5] => 0\n  // Your solution here\n}",
    reviewCases: [
      "[] -> 0",
      "[-4,1,2,8] -> 6",
      "[3,5] -> 0",
      "[-2,-2,0] -> -4; input unchanged.",
    ],
  },
];
