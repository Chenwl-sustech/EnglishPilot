import { practiceItemSchema, type PracticeItem } from "./practice-model";
const sourceId = "englishpilot-original-v2";
function item(
  id: string,
  kind: PracticeItem["kind"],
  prompt: string,
  extra: Partial<PracticeItem> = {},
): PracticeItem {
  return practiceItemSchema.parse({
    id,
    materialId: id,
    skill: kind === "speaking" ? "speaking" : "writing",
    level: "advanced",
    kind,
    questionType: kind,
    prompt,
    context: "",
    explanation: "原创练习，主观回答需要人工自评或单独请求 AI 模拟评价。",
    sourceId,
    ...extra,
  });
}

const essayTopics = [
  "Some people believe cities should spend more on public transport than on new roads. To what extent do you agree or disagree? Give reasons and relevant examples.",
  "Some universities require all students to complete community projects before graduating. Discuss the advantages and disadvantages and give your own opinion.",
  "More people now work from home. Do the benefits of this development outweigh its disadvantages for workers and their communities?",
  "Schools should teach students how to evaluate information found online. To what extent do you agree or disagree? Give reasons and examples.",
];
export function examWriting(
  exam: "ielts" | "toefl",
  variant: number,
): PracticeItem[] {
  const n = variant % essayTopics.length;
  if (exam === "ielts")
    return [
      item(
        `exam:ielts:${n}:task1`,
        "writing",
        "The table shows how students travelled to one university in 2010 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.",
        {
          questionType: "IELTS Academic Writing Task 1",
          minWords: 150,
          context:
            "Original survey data for this practice task (percent of students)\nMode             2010     2025\nWalking           20       25\nBicycle           15       30\nBus               25       30\nPrivate car       40       15\nEach year totals 100%. These are fictional survey data, not a real institution's results.",
        },
      ),
      item(
        `exam:ielts:${n}:task2`,
        "writing",
        `${essayTopics[n]} Write at least 250 words.`,
        { questionType: "IELTS Writing Task 2", minWords: 250 },
      ),
    ];
  const sentences = [
    [
      "Where can I find the updated timetable?",
      "the updated timetable / can I find / Where",
    ],
    [
      "The seminar was postponed because the speaker was ill.",
      "because / the speaker was ill / The seminar / was postponed",
    ],
    [
      "Students who register early can choose a workshop.",
      "can choose a workshop / who register early / Students",
    ],
    [
      "I would appreciate it if you could send the notes.",
      "if you could / I would appreciate it / send the notes",
    ],
    [
      "Although the sample was small, the pattern was consistent.",
      "the pattern was consistent / Although / the sample was small",
    ],
    [
      "The report that you recommended is available online.",
      "is available online / that you recommended / The report",
    ],
    [
      "Could you tell me when the library closes?",
      "when the library closes / Could you / tell me",
    ],
    [
      "The more carefully we plan, the less time we waste.",
      "the less time we waste / we plan / The more carefully",
    ],
    [
      "Neither of the proposals addresses the cost of maintenance.",
      "addresses / Neither of the proposals / the cost of maintenance",
    ],
    [
      "Having checked the data, the team revised its conclusion.",
      "the team / revised its conclusion / Having checked the data",
    ],
  ];
  return [
    ...sentences.map(([expected, blocks], i) =>
      item(
        `exam:toefl:${n}:build${i}`,
        "sentence",
        "Arrange all the supplied blocks into one grammatically correct sentence. You may add terminal punctuation.",
        {
          questionType: "Build a Sentence",
          context: blocks,
          expected,
          explanation: `参考顺序：${expected}`,
        },
      ),
    ),
    item(
      `exam:toefl:${n}:email`,
      "writing",
      "You missed a university workshop because the registration website showed the wrong location. Write an email to the coordinator. Explain what happened, describe how it affected you, and request a practical way to catch up. Use an appropriate tone.",
      {
        questionType: "TOEFL 2026 Write an Email",
        context:
          "You are a student writing to Dr. Morgan, the workshop coordinator. Aim to use the available 7 minutes effectively; there is no minimum word requirement in this original task.",
      },
    ),
    item(
      `exam:toefl:${n}:discussion`,
      "writing",
      "Professor: Our city can fund either more trees along streets or a new indoor recreation centre. Which investment would benefit residents more, and why? Add your own contribution to the discussion.",
      {
        questionType: "TOEFL 2026 Academic Discussion",
        context:
          "Lina: Trees would provide shade and make daily walks more comfortable.\nOmar: A recreation centre could offer affordable activities throughout the year.\nDevelop your own view and respond to an idea when useful. Use reasons or examples; copying the students' wording is insufficient.",
        minWords: 100,
      },
    ),
  ];
}

export function examSpeaking(
  exam: "ielts" | "toefl",
  variant: number,
): PracticeItem[] {
  const n = variant % 4;
  if (exam === "ielts")
    return [
      item(
        `exam:ielts:${n}:part1`,
        "speaking",
        "Tell me about the place where you study or work. What do you enjoy about your daily routine? Is there anything you would like to change?",
        { questionType: "IELTS Speaking Part 1", responseSeconds: 240 },
      ),
      item(
        `exam:ielts:${n}:part2`,
        "speaking",
        "Describe a skill that you learned from another person. Say what the skill was, who taught you, how you practised, and explain why learning it was useful.",
        {
          questionType: "IELTS Speaking Part 2",
          preparationSeconds: 60,
          responseSeconds: 120,
        },
      ),
      item(
        `exam:ielts:${n}:part3`,
        "speaking",
        "How has technology changed the way people learn practical skills? Is learning from a person always better than learning from a video? Should schools place more emphasis on practical skills? Give reasons.",
        { questionType: "IELTS Speaking Part 3", responseSeconds: 240 },
      ),
    ];
  const repeats = [
    "Welcome to the campus learning centre.",
    "The information desk is beside the main entrance.",
    "Please return your visitor badge before leaving the building.",
    "Students who need a quiet room should book it online.",
    "Although the exhibition closes at five, the café remains open until six.",
    "If you would like to attend the workshop, complete the form by Friday.",
    "The library has extended its opening hours so that students can prepare for their final projects.",
  ];
  const questions = [
    "What is one activity you enjoy doing with other people, and why?",
    "Describe a time when a plan changed unexpectedly. How did you respond?",
    "Do you prefer to learn a new skill independently or with a teacher? Explain your preference.",
    "Some people think local communities should organise more free events. What benefits or difficulties might this create?",
  ];
  return [
    ...repeats.map((text, i) =>
      item(
        `exam:toefl:${n}:repeat${i}`,
        "speaking",
        "Listen to the sentence and repeat it as accurately as you can.",
        {
          questionType: "TOEFL 2026 Listen and Repeat",
          context: text,
          responseSeconds: 15,
        },
      ),
    ),
    ...questions.map((prompt, i) =>
      item(`exam:toefl:${n}:interview${i}`, "speaking", prompt, {
        questionType: "TOEFL 2026 Take an Interview",
        responseSeconds: 45,
      }),
    ),
  ];
}

/** Two original short paragraphs; keep the first sentence intact and complete ten word endings. */
export function examWordCompletion(): PracticeItem[] {
  const paragraphs = [
    {
      text: "A city team wanted to understand summer heat. The researchers collected data from streets with different amounts of shade. Each sensor recorded the temperature at the same time every afternoon. A fair comparison required more than a single hot day, so the team worked throughout July. The evidence showed a pattern, but several possible explanations remained. Traffic might influence the readings, and nearby buildings could affect the amount of sunlight. The team therefore avoided a simple conclusion about trees alone. They repeated the measurements at additional sites and described the limits of the study in a report for residents.",
      targets: [
        "researchers",
        "collected",
        "different",
        "temperature",
        "comparison",
        "evidence",
        "possible",
        "influence",
        "conclusion",
        "repeated",
      ],
    },
    {
      text: "A university library recently changed its booking system. Students can now reserve a quiet space before they arrive. The previous arrangement required visitors to wait at a desk, which sometimes created a queue during busy periods. The new service provides information about available rooms and sends a reminder before each booking. However, students must cancel a reservation if their plans change. Otherwise, an empty room may remain unavailable to someone who needs it. Staff will evaluate the system after a month by examining records and asking students about their experience. They hope the change will improve access without increasing the number of rooms.",
      targets: [
        "reserve",
        "previous",
        "arrangement",
        "required",
        "provides",
        "available",
        "reminder",
        "reservation",
        "evaluate",
        "improve",
      ],
    },
  ];
  return paragraphs.flatMap((p, n) => {
    let context = p.text;
    const gaps = p.targets.map((word, index) => {
      const prefix = word.slice(0, Math.ceil(word.length / 2)),
        expected = word.slice(prefix.length);
      context = context.replace(
        new RegExp(`\\b${word}\\b`),
        `${prefix}[${index + 1}]${"_".repeat(expected.length)}`,
      );
      return { prefix, expected };
    });
    return gaps.map((g, index) =>
      item(
        `exam:toefl:cloze${n}:q${index + 1}`,
        "sentence",
        `Complete the missing letters for word ${index + 1}: ${g.prefix}${"_".repeat(g.expected.length)}. Enter only the missing letters.`,
        {
          materialId: `exam:toefl:cloze${n}`,
          skill: "reading",
          level: "intermediate",
          questionType: "Complete the Words",
          context,
          expected: g.expected,
          explanation: `完整单词：${p.targets[index]}。结合段落语境、词形与已给字母补全。`,
        },
      ),
    );
  });
}
