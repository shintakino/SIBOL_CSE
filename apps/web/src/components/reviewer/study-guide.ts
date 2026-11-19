// Original concept reminders. No provider question bank or answer keys are bundled.
export const conceptCards: {
  term: string;
  definition: string;
  area: string;
  track?: "professional" | "subprofessional";
}[] = [
  {
    term: "Subject–verb agreement",
    definition:
      "A singular subject normally takes a singular verb; a plural subject takes a plural verb. Identify the subject rather than the nearest noun.",
    area: "Verbal Ability",
  },
  {
    term: "Main idea",
    definition:
      "The central point supported by the paragraph’s details. Prefer the statement that covers the whole passage without adding unsupported claims.",
    area: "Verbal Ability",
  },
  {
    term: "Inference",
    definition:
      "A conclusion supported by the information given. It goes beyond a direct quotation but must still follow from the passage.",
    area: "Verbal Ability",
  },
  {
    term: "Parallel structure",
    definition:
      "Use matching grammatical forms for items with the same role: reading, writing and reviewing.",
    area: "Verbal Ability",
  },
  {
    term: "Paragraph organization",
    definition:
      "Find the topic sentence, follow references and transitions, then identify the concluding idea. Check that each sentence connects to the one before it.",
    area: "Verbal Ability",
  },
  {
    term: "Context clues",
    definition:
      "Use surrounding words, examples, contrasts and explanations to infer a word’s meaning in that specific sentence.",
    area: "Verbal Ability",
  },
  {
    term: "Percentage change",
    definition:
      "Divide the change by the original amount, then multiply by 100. The original amount is the comparison base.",
    area: "Numerical Ability",
  },
  {
    term: "Order of operations",
    definition:
      "Evaluate grouping symbols, exponents, multiplication/division from left to right, then addition/subtraction from left to right.",
    area: "Numerical Ability",
  },
  {
    term: "Weighted mean",
    definition:
      "Multiply each value by its weight, add those products, and divide by the sum of the weights.",
    area: "Numerical Ability",
  },
  {
    term: "Ratio",
    definition:
      "A comparison by division. Keep quantities in matching units and multiply or divide both parts by the same number.",
    area: "Numerical Ability",
  },
  {
    term: "Analogy",
    definition:
      "Identify the relationship in the first pair, then apply that same relationship and direction to the second pair.",
    area: "Analytical Ability",
    track: "professional",
  },
  {
    term: "Assumption",
    definition:
      "An unstated idea an argument relies on. Test whether denying it would weaken the argument’s reasoning.",
    area: "Analytical Ability",
    track: "professional",
  },
  {
    term: "Necessary conclusion",
    definition:
      "A statement that must follow from the premises. Something that could be true is not necessarily guaranteed.",
    area: "Analytical Ability",
    track: "professional",
  },
  {
    term: "Data interpretation",
    definition:
      "Read the title, labels, units, legend and scale before calculating. Distinguish percentage points from percent change.",
    area: "Analytical Ability",
    track: "professional",
  },
  {
    term: "Alphabetical filing",
    definition:
      "Compare entries letter by letter. If one entry is an exact prefix of another, the shorter entry comes first; apply any special filing instructions given.",
    area: "Clerical Ability",
    track: "subprofessional",
  },
  {
    term: "Spelling check",
    definition:
      "Read the whole word, then check its root, prefixes, suffixes and repeated letters. Familiar sound alone does not guarantee correct spelling.",
    area: "Clerical Ability",
    track: "subprofessional",
  },
  {
    term: "Public-service ethics",
    definition:
      "Put public interest first, act with integrity and professionalism, and avoid conflicts between public duties and private interests.",
    area: "General Information",
  },
  {
    term: "Rights and responsibilities",
    definition:
      "Read each question’s stated facts carefully. Distinguish a protected right, a public duty and a specific procedure rather than treating them as interchangeable.",
    area: "General Information",
  },
  {
    term: "Environmental protection",
    definition:
      "Reduce waste at its source, reuse when practical, and separate materials for appropriate recycling or disposal.",
    area: "General Information",
  },
];
export const formulaCards = [
  {
    term: "Percentage",
    definition:
      "Part = Whole × Rate\nRate (%) = Part ÷ Whole × 100\nExample: 15% of 200 = 0.15 × 200 = 30.",
  },
  {
    term: "Percent change",
    definition:
      "Change (%) = (New − Original) ÷ Original × 100\nFrom 80 to 100: 20 ÷ 80 × 100 = 25% increase.",
  },
  {
    term: "Average",
    definition:
      "Mean = Sum of values ÷ Number of values\nWeighted mean = Σ(value × weight) ÷ Σweights.",
  },
  {
    term: "Distance, rate and time",
    definition:
      "Distance = Rate × Time\nKeep time and speed units consistent. For example, convert 30 minutes to 0.5 hour when using km/h.",
  },
  {
    term: "Work rates",
    definition:
      "Rate = 1 ÷ Time for one whole job\nFor independent workers working together, add their rates; combined time = 1 ÷ combined rate.",
  },
  {
    term: "Simple interest",
    definition:
      "Interest = Principal × Rate × Time\nUse the rate as a decimal and match the time unit to the rate’s period.",
  },
  {
    term: "Number series",
    definition:
      "Check differences, ratios, alternating rules and squares/cubes. Verify a proposed pattern against every given term.",
  },
  {
    term: "Area and perimeter",
    definition:
      "Rectangle area = length × width\nRectangle perimeter = 2(length + width)\nTriangle area = ½ × base × height.",
  },
];
