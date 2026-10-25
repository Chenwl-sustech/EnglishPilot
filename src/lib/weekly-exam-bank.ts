import { practiceItemSchema, type PracticeItem } from "./practice-model";

export const weeklyExamSource = {
  id: "englishpilot-weekly-original-v1",
  name: "EnglishPilot 原创 IELTS / TOEFL 专项小测题库",
  url: "local:englishpilot/weekly-exam-bank-v1",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution:
    "EnglishPilot original exam-specific weekly practice bank (2026)",
  modification:
    "原创材料、脚本、题目与中文解析；未复制官方真题。基础、进阶、学术为教学难度分组，不构成 CEFR 或官方考试能力认证。",
};

type Exam = "ielts" | "toefl";
type Level = "foundation" | "intermediate" | "advanced";

// These are original teaching materials, not official papers or a score predictor.
// Evidence is copied verbatim from the accompanying original passage/script.
type Question = [
  id: string,
  type: string,
  prompt: string,
  options: string[],
  correct: number,
  evidence: string,
  explanation: string,
];
type Material = {
  id: string;
  skill: "foundation" | "reading" | "listening";
  context: string;
  questions: Question[];
};
const tfng = ["True", "False", "Not Given"];

const ieltsFoundation: Material[] = [
  {
    id: "sewing-routine",
    skill: "foundation",
    context:
      "Mina goes to a sewing class every Thursday. She is talking about her usual weekly routine.",
    questions: [
      [
        "g1",
        "grammar / present simple",
        "Which sentence correctly describes Mina's usual Thursday activity?",
        [
          "She attend a sewing class.",
          "She attends a sewing class.",
          "She attending a sewing class.",
        ],
        1,
        "Mina goes to a sewing class every Thursday.",
        "every Thursday 表示习惯；第三人称单数 she 后的一般现在时动词应为 attends。",
      ],
    ],
  },
  {
    id: "urgent-repair",
    skill: "foundation",
    context:
      "The housing notice says the broken front-door lock needs an urgent repair. A worker must fix it today because the door cannot close safely.",
    questions: [
      [
        "v1",
        "vocabulary / meaning in context",
        "In the housing notice, an 'urgent' repair needs to be done in which way?",
        ["Without delay", "Only after winter", "Without any tools"],
        0,
        "A worker must fix it today because the door cannot close safely.",
        "当天必须修好且涉及门锁安全，urgent 指需要立即处理，并非等到冬天或不使用工具。",
      ],
    ],
  },
  {
    id: "closed-pool",
    skill: "foundation",
    context:
      "Ravi reached the swimming pool yesterday, but it was closed. He went to the park instead.",
    questions: [
      [
        "g2",
        "grammar / past simple",
        "Complete Ravi's account: 'Yesterday I ___ to the park because the pool was closed.'",
        ["go", "going", "went"],
        2,
        "He went to the park instead.",
        "yesterday 与 was 表示过去，go 的过去式是 went。",
      ],
    ],
  },
  {
    id: "spare-chair",
    skill: "foundation",
    context:
      "There are six guests and seven chairs in the room. The host puts the spare chair beside the wall because nobody needs it yet.",
    questions: [
      [
        "v2",
        "vocabulary / meaning in context",
        "What does 'spare' tell us about the seventh chair at this gathering?",
        ["It is broken.", "It is extra and available.", "It belongs outside."],
        1,
        "The host puts the spare chair beside the wall because nobody needs it yet.",
        "七张椅子供六人使用，多出来且暂时不用的椅子是备用椅，spare 表示多余可备用。",
      ],
    ],
  },
  {
    id: "seed-cabinet",
    skill: "reading",
    context:
      "A small seed cabinet stands inside Bell Street Library. Residents can take two packets of vegetable seeds each month without paying. They do not need to bring seeds back, although donations are welcome. Each packet has a picture and a short planting guide. The cabinet began as a project by three neighbours who wanted more people to try growing food. Library staff refill it on Friday mornings. The library also has books about gardening, but its volunteers do not visit people's homes.",
    questions: [
      [
        "r1",
        "Matching Headings",
        "Choose the best heading for the whole Bell Street seed-cabinet passage.",
        [
          "A free way to begin growing vegetables",
          "A delivery service for garden books",
          "Why the library stopped taking donations",
        ],
        0,
        "Residents can take two packets of vegetable seeds each month without paying.",
        "材料围绕免费领取种子及种植指南展开；没有送书服务，也没有停止接受捐赠。",
      ],
      [
        "r2",
        "True / False / Not Given",
        "The seed-cabinet passage states: Residents must return seeds after taking a packet.",
        tfng,
        1,
        "They do not need to bring seeds back, although donations are welcome.",
        "原文明说不必归还；捐赠只是欢迎而非强制，因此陈述与原文相反，为 False。",
      ],
      [
        "r3",
        "True / False / Not Given",
        "The seed-cabinet passage states: The three neighbours paid for the cabinet themselves.",
        tfng,
        2,
        "The cabinet began as a project by three neighbours who wanted more people to try growing food.",
        "原文只交代发起者和目的，全文未说明由谁支付柜子的费用；不能由发起推断出资，为 Not Given。",
      ],
    ],
  },
  {
    id: "canal-bus",
    skill: "reading",
    context:
      "The new canal bus connects West Market with the history museum. It leaves the market at ten o'clock on Saturdays and Sundays. The trip takes twenty minutes, with no stops on the way. Tickets are sold on board, and children under twelve travel free with an adult. Passengers may bring a small bag, but bicycles must stay at the market's bike stand. The boat has an open deck, so passengers should bring a coat on cool days. In strong winds the service does not run.",
    questions: [
      [
        "r4",
        "IELTS reading / detail",
        "How long is the canal-bus journey from West Market to the museum?",
        ["Ten minutes", "Twelve minutes", "Twenty minutes"],
        2,
        "The trip takes twenty minutes, with no stops on the way.",
        "twenty minutes 直接给出航程时长；十点是出发时间，十二是儿童票年龄界限。",
      ],
      [
        "r5",
        "True / False / Not Given",
        "The canal-bus passage states: Passengers can take their bicycles onto the boat.",
        tfng,
        1,
        "Passengers may bring a small bag, but bicycles must stay at the market's bike stand.",
        "自行车必须留在市场停车架，与可带上船的陈述相反，为 False。",
      ],
      [
        "r6",
        "IELTS reading / detail",
        "In which weather will the canal-bus operator cancel the service?",
        ["Cool air", "Light cloud", "Strong winds"],
        2,
        "In strong winds the service does not run.",
        "取消条件明确是强风；天气凉时建议带外套，并未取消。",
      ],
    ],
  },
  {
    id: "pottery-booking",
    skill: "listening",
    context:
      "Receptionist: Good morning, Hill House classes. Caller: I'd like to book the beginners' pottery session. Is that still on Tuesday? Receptionist: It used to be, but this month it is on Thursday, from six to eight in the evening. Caller: Do I need to buy clay? Receptionist: No, clay and tools are included in the eighteen-pound fee. Please bring an old shirt to protect your clothes. Caller: Where should I go? Receptionist: Room four, beside the garden entrance. Please arrive ten minutes early to sign in.",
    questions: [
      [
        "l1",
        "IELTS listening / booking detail",
        "Which day is the beginners' pottery session this month?",
        ["Tuesday", "Thursday", "Saturday"],
        1,
        "this month it is on Thursday, from six to eight in the evening.",
        "Tuesday 是以前的安排，this month 后的更正为 Thursday。",
      ],
      [
        "l2",
        "IELTS listening / required item",
        "What should the pottery caller bring to the class?",
        ["An old shirt", "A bag of clay", "A set of tools"],
        0,
        "Please bring an old shirt to protect your clothes.",
        "黏土和工具已含在费用内，来电者需要带旧衬衫保护衣服。",
      ],
      [
        "l3",
        "IELTS listening / location",
        "Which room should the caller use for the Hill House pottery class?",
        ["Room two", "Room six", "Room four"],
        2,
        "Room four, beside the garden entrance.",
        "接待员明确说四号房；six 是上课时间，不是房间号。",
      ],
    ],
  },
  {
    id: "pond-walk",
    skill: "listening",
    context:
      "Guide: Welcome to the pond walk. Before we begin, put your phones on silent so we can listen for birds. We will stay on the wooden path because the grass near the water is soft. Our first stop is the viewing shelter, where you can borrow binoculars. Please return them before we leave the shelter. Later we will look for water insects, using small trays rather than nets. The walk ends at the visitor centre at eleven thirty. There is no shop beside the pond, but drinking water is available at the centre.",
    questions: [
      [
        "l4",
        "IELTS listening / reason",
        "Why does the pond guide ask the group to silence their phones?",
        [
          "To save phone batteries",
          "To hear birds",
          "To protect the wooden path",
        ],
        1,
        "put your phones on silent so we can listen for birds.",
        "so 表明目的：保持安静以听鸟声，与省电或木栈道保护无关。",
      ],
      [
        "l5",
        "IELTS listening / equipment",
        "What will the pond group use to examine water insects?",
        ["Small trays", "Fishing nets", "Glass bottles"],
        0,
        "using small trays rather than nets.",
        "rather than 表示排除 nets，实际使用的是小托盘。",
      ],
      [
        "l6",
        "IELTS listening / finishing time",
        "At what time will the pond walk finish at the visitor centre?",
        ["Eleven o'clock", "Twelve thirty", "Eleven thirty"],
        2,
        "The walk ends at the visitor centre at eleven thirty.",
        "结束时间为十一点半，且地点为游客中心。",
      ],
    ],
  },
];

const ieltsIntermediate: Material[] = [
  {
    id: "museum-condition",
    skill: "foundation",
    context:
      "The museum guide says that visitors can enter the archive only after they have booked an appointment. A booking is a necessary condition of entry.",
    questions: [
      [
        "g1",
        "grammar / first conditional",
        "Complete the archive rule: 'If you ___ an appointment, you will be able to enter the archive.'",
        ["made", "make", "will make"],
        1,
        "A booking is a necessary condition of entry.",
        "第一条件句 if 从句用一般现在时，主句用 will；因此填 make。",
      ],
    ],
  },
  {
    id: "temporary-bridge",
    skill: "foundation",
    context:
      "Workers have built a temporary footbridge while the old stone bridge is repaired. They will remove the new structure when the repairs are complete.",
    questions: [
      [
        "v1",
        "vocabulary / meaning in context",
        "What does 'temporary' mean for the workers' footbridge?",
        [
          "Designed to last forever",
          "Made entirely of stone",
          "Intended for a limited period",
        ],
        2,
        "They will remove the new structure when the repairs are complete.",
        "修缮结束后就拆除，说明 temporary 指临时使用一段时间。",
      ],
    ],
  },
  {
    id: "lost-reservation",
    skill: "foundation",
    context:
      "A visitor arrived at the lodge at noon. The receptionist discovered that the computer had deleted his reservation earlier that morning.",
    questions: [
      [
        "g2",
        "grammar / past perfect",
        "Choose the verb form showing that the deletion happened before the visitor arrived: 'The computer ___ his reservation.'",
        ["had deleted", "will delete", "deletes"],
        0,
        "the computer had deleted his reservation earlier that morning.",
        "删除先于过去的到店事件发生，使用过去完成时 had deleted。",
      ],
    ],
  },
  {
    id: "viable-route",
    skill: "foundation",
    context:
      "The hill road is too steep for loaded delivery bikes. The riverside path is longer, but tests show that riders can use it safely with full loads. The planners call it a viable alternative.",
    questions: [
      [
        "v2",
        "vocabulary / meaning in context",
        "What does 'viable' suggest about the riverside delivery route?",
        [
          "It is the shortest route.",
          "It can work in practice.",
          "It requires no testing.",
        ],
        1,
        "tests show that riders can use it safely with full loads.",
        "测试表明满载也能安全通行，因此 viable 表示可行，不等于最短或无需测试。",
      ],
    ],
  },
  {
    id: "repair-evening",
    skill: "reading",
    context:
      "At North Quay's monthly repair evening, visitors bring damaged household objects and work alongside volunteers. The organisers originally expected most people to bring electrical appliances. In the first six months, however, torn clothing made up more than half of all items. This changed the way the event was staffed: two additional sewing volunteers joined the team. Visitors pay nothing for advice, although they must purchase any replacement parts themselves.\n\nThe organisers count an item as repaired only if its owner can demonstrate that it works before leaving. They also record cases where the volunteer explains a repair that must be completed at home. These cases are listed separately rather than included in the repair total. According to the organisers, this makes the results more useful for deciding which skills are needed at future events.",
    questions: [
      [
        "r1",
        "Matching Headings",
        "Which heading best summarises the first paragraph about North Quay's repair evening?",
        [
          "Adapting volunteer skills to actual demand",
          "Charging visitors for professional advice",
          "Replacing clothing with electrical equipment",
        ],
        0,
        "torn clothing made up more than half of all items. This changed the way the event was staffed",
        "第一段核心是实际需求偏向缝补，因此增加缝纫志愿者；并非收费或更换物品种类。",
      ],
      [
        "r2",
        "True / False / Not Given",
        "The North Quay passage states: Owners pay for replacement parts needed for their objects.",
        tfng,
        0,
        "they must purchase any replacement parts themselves.",
        "原文明说替换零件由物主自己购买，故为 True；免费的是建议。",
      ],
      [
        "r3",
        "True / False / Not Given",
        "The North Quay passage states: Most sewing volunteers are retired teachers.",
        tfng,
        2,
        "two additional sewing volunteers joined the team.",
        "全文只说明新增两位缝纫志愿者，没有其职业或退休情况，为 Not Given。",
      ],
    ],
  },
  {
    id: "cool-roof-trial",
    skill: "reading",
    context:
      "A housing association tested a pale roof coating on twelve similar storage buildings. During four summer weeks, sensors recorded indoor temperatures in six coated buildings and six uncoated ones. The coated buildings were cooler on sunny afternoons, but there was little difference after sunset. The association therefore described the coating as a possible way to reduce daytime heat, rather than a solution for every hour.\n\nThe buildings contained no heating or cooling equipment, and staff opened all their doors at the same scheduled times. However, the trial used only one site, close to the coast. The report recommended repeating the measurements in an inland location before buying the coating for all the association's properties. It also noted that a coating which performs well in summer might have different consequences in winter; winter temperatures were outside this trial's scope.",
    questions: [
      [
        "r4",
        "IELTS reading / detail",
        "When did the pale roof coating produce the clearest temperature difference in the trial?",
        ["After sunset", "On sunny afternoons", "Throughout winter nights"],
        1,
        "The coated buildings were cooler on sunny afternoons, but there was little difference after sunset.",
        "温差出现在晴天下午；日落后差异很小，冬季并未测量。",
      ],
      [
        "r5",
        "True / False / Not Given",
        "The roof-coating report states: The trial established how the coating affects winter indoor temperatures.",
        tfng,
        1,
        "winter temperatures were outside this trial's scope.",
        "冬季温度不在试验范围，不能说试验已经确定冬季影响，故为 False。",
      ],
      [
        "r6",
        "IELTS reading / inference",
        "Why does the roof-coating report recommend an inland follow-up trial?",
        [
          "To replace every temperature sensor",
          "To measure the colour of the sea",
          "To check whether results extend beyond the coastal site",
        ],
        2,
        "the trial used only one site, close to the coast.",
        "单一沿海地点限制推广；内陆复测可检查结果是否适用于不同地点。",
      ],
    ],
  },
  {
    id: "archive-interview",
    skill: "listening",
    context:
      "Coordinator: Thanks for helping with our oral-history project. Each volunteer will interview one resident about the old food market. Volunteer: Should I ask them to bring photographs? Coordinator: Only if they wish. Our priority is to record their own memories, not collect objects. Please begin with an open question about an ordinary market day. Volunteer: Can I use my phone to record? Coordinator: Yes, but first read the consent statement and get the resident's spoken agreement on the recording. If they prefer not to be recorded, take notes instead. Volunteer: When is the recording due? Coordinator: Upload it by the eighteenth. The twentieth is our editing meeting, so we need the files two days before that.",
    questions: [
      [
        "l1",
        "IELTS listening / project aim",
        "What is the oral-history coordinator's main priority for the interviews?",
        [
          "Collecting old market objects",
          "Recording residents' personal memories",
          "Selling residents' photographs",
        ],
        1,
        "Our priority is to record their own memories, not collect objects.",
        "priority 后直接指出主要任务为个人回忆，照片只是自愿提供。",
      ],
      [
        "l2",
        "IELTS listening / sequence",
        "What must the archive volunteer do before starting a recorded interview?",
        [
          "Obtain spoken consent on the recording",
          "Attend the editing meeting",
          "Ask the resident to sign a photograph",
        ],
        0,
        "first read the consent statement and get the resident's spoken agreement on the recording.",
        "first 标明前置步骤：宣读同意声明并录下口头同意。",
      ],
      [
        "l3",
        "IELTS listening / corrected deadline",
        "By which date must the volunteer upload the oral-history recording?",
        ["The twentieth", "The twenty-second", "The eighteenth"],
        2,
        "Upload it by the eighteenth.",
        "十八日是上传截止，二十日是编辑会议，需区分任务日期。",
      ],
    ],
  },
  {
    id: "reedbed-study",
    skill: "listening",
    context:
      "Tutor: For our reedbed study we will compare insect counts at the edge and in the centre of the reeds. Student: Could the weather affect the numbers? Tutor: Certainly. That is why both teams will sample during the same thirty-minute period. We will repeat the procedure on three mornings, keeping the locations fixed. Student: Last year's group used sticky traps. Tutor: We will use sweep nets instead, because we need to release the insects after identifying them. Please count each insect only once and record uncertain identifications as unknown. Student: Should we explain any difference as an effect of location? Tutor: Only cautiously. Water depth also varies between the sites, so our observations alone cannot separate those influences.",
    questions: [
      [
        "l4",
        "IELTS listening / research procedure",
        "Why will the two reedbed teams collect insects during the same time period?",
        [
          "To prevent changing weather from distorting the comparison",
          "To finish all three mornings at once",
          "To avoid measuring the water depth",
        ],
        0,
        "Could the weather affect the numbers? Tutor: Certainly. That is why both teams will sample during the same thirty-minute period.",
        "同期采样针对天气可能影响数量的问题，不能因此排除水深等其他因素。",
      ],
      [
        "l5",
        "IELTS listening / equipment change",
        "Which sampling equipment will this year's reedbed group use?",
        ["Sticky traps", "Sweep nets", "Underwater cameras"],
        1,
        "We will use sweep nets instead, because we need to release the insects after identifying them.",
        "sticky traps 是去年方法，今年改为便于放生的 sweep nets。",
      ],
      [
        "l6",
        "IELTS listening / limitation",
        "What makes the tutor cautious about linking insect counts to location alone?",
        [
          "The teams will not identify any insects.",
          "The study has no fixed locations.",
          "Water depth differs between the sites.",
        ],
        2,
        "Water depth also varies between the sites, so our observations alone cannot separate those influences.",
        "地点之外水深也不同，存在混杂因素，不能只归因于位置。",
      ],
    ],
  },
];

const ieltsAdvanced: Material[] = [
  {
    id: "rarely-delayed",
    skill: "foundation",
    context:
      "In the monitoring programme, departures were almost always punctual. The coordinator emphasises this by beginning the report sentence with 'Rarely'.",
    questions: [
      [
        "g1",
        "grammar / negative inversion",
        "Complete the coordinator's formal report: 'Rarely ___ delayed during the monitoring programme.'",
        ["the departures were", "did the departures", "were the departures"],
        2,
        "The coordinator emphasises this by beginning the report sentence with 'Rarely'.",
        "否定意义副词 Rarely 位于句首时主谓部分倒装，故 were the departures。did 后缺动词原形，不能接 delayed 作此处的被动结构。",
      ],
    ],
  },
  {
    id: "tentative-estimate",
    skill: "foundation",
    context:
      "The engineers call their estimate tentative because two ground surveys are incomplete. They expect to revise the figures when the remaining measurements arrive.",
    questions: [
      [
        "v1",
        "vocabulary / academic nuance",
        "What does 'tentative' communicate about the engineers' estimate?",
        [
          "It is provisional and may change.",
          "It is deliberately concealed.",
          "It is certain to be too high.",
        ],
        0,
        "They expect to revise the figures when the remaining measurements arrive.",
        "数据尚未齐全且预计修订，tentative 表示暂定；并非刻意保密或必定高估。",
      ],
    ],
  },
  {
    id: "counterfactual-survey",
    skill: "foundation",
    context:
      "The research team did not retain the original survey forms. Consequently, they could not check a disputed entry after the report was published.",
    questions: [
      [
        "g2",
        "grammar / past counterfactual",
        "Choose the correct past counterfactual: 'Had the team retained the forms, they ___ the disputed entry.'",
        ["can check", "could have checked", "had checked"],
        1,
        "they could not check a disputed entry after the report was published.",
        "Had the team retained 相当于 If the team had retained，是与过去事实相反的条件；结果用 could have checked。",
      ],
    ],
  },
  {
    id: "qualified-claim",
    skill: "foundation",
    context:
      "The authors qualified their claim by restricting it to small, owner-operated shops. They explicitly warned that the findings might not apply to large retail chains.",
    questions: [
      [
        "v2",
        "vocabulary / academic nuance",
        "In the retail study, what did the authors do when they 'qualified' their claim?",
        [
          "Proved it for every business",
          "Awarded it a certificate",
          "Limited the conditions under which it applied",
        ],
        2,
        "restricting it to small, owner-operated shops.",
        "qualify a claim 在此指限定主张适用范围，与证明所有情况或颁发资格证书无关。",
      ],
    ],
  },
  {
    id: "tidal-records",
    skill: "reading",
    context:
      "A regional archive has digitised handwritten tide observations from a nineteenth-century harbour. The new collection allows researchers to compare early measurements with recent instrument records. Yet the archivists reject the idea that digitisation simply turns old numbers into immediately comparable data. Early observers recorded height against a painted mark on a harbour wall; later instruments used a reference point surveyed on stable ground. A direct comparison without reconstructing that change could suggest a shift in sea level where none had occurred.\n\nTo address the problem, the project publishes photographs of the original pages alongside each transcription and supplies a history of reference-point changes. Unclear figures remain flagged rather than silently corrected. Although this reduces the number of observations available for automatic analysis, it allows researchers to inspect the uncertainties for themselves. The archive presents transparency about measurement conditions as a prerequisite for reliable reuse, rather than treating the largest possible dataset as the principal achievement.",
    questions: [
      [
        "r1",
        "Matching Headings",
        "Which heading best captures the argument of the tidal-records passage as a whole?",
        [
          "Preserving measurement context for trustworthy comparisons",
          "Replacing all modern instruments with harbour walls",
          "Proving that larger datasets always remove uncertainty",
        ],
        0,
        "The archive presents transparency about measurement conditions as a prerequisite for reliable reuse",
        "全文强调数值之外还须保留基准点和不确定性，方可可靠比较。",
      ],
      [
        "r2",
        "True / False / Not Given",
        "The tidal-records passage states: The project silently replaces unclear handwritten figures with estimates.",
        tfng,
        1,
        "Unclear figures remain flagged rather than silently corrected.",
        "含糊数字保留标记而非默默更正，陈述与原文相反，为 False。",
      ],
      [
        "r3",
        "True / False / Not Given",
        "The tidal-records passage states: The archive hired more transcribers than photographers.",
        tfng,
        2,
        "the project publishes photographs of the original pages alongside each transcription",
        "全文未提供任何岗位人数，发布照片和转录不能推出两种人员数量，为 Not Given。",
      ],
    ],
  },
  {
    id: "modular-housing",
    skill: "reading",
    context:
      "A city evaluation compared two modular housing pilots with a conventional project completed in the same district. Factory production shortened the period during which building sites were noisy. However, the evaluation distinguished time spent on site from total delivery time. In one modular pilot, the need to redesign a non-standard stair unit delayed factory production, cancelling much of the apparent scheduling advantage.\n\nThe evaluators also cautioned against attributing every difference in cost to construction method. The conventional project occupied a narrow plot with difficult vehicle access, whereas both modular pilots had generous unloading areas. Transport permits and crane availability affected the pilots in ways that would not necessarily recur elsewhere. The report therefore recommended comparing projects with similar site constraints before setting citywide procurement rules. It did not dismiss modular construction; instead, it argued that a promising method still requires careful matching between design, manufacturing capacity and the conditions at the eventual site.",
    questions: [
      [
        "r4",
        "IELTS reading / distinction",
        "Which distinction is central to the modular-housing evaluation's account of speed?",
        [
          "Stair height versus vehicle width",
          "On-site duration versus total delivery time",
          "Factory noise versus permit prices",
        ],
        1,
        "the evaluation distinguished time spent on site from total delivery time.",
        "现场作业时间较短不必然意味着整体交付更快，楼梯重设计造成的工厂延迟说明这一点。",
      ],
      [
        "r5",
        "True / False / Not Given",
        "The housing passage states: All three projects faced equally difficult vehicle access.",
        tfng,
        1,
        "The conventional project occupied a narrow plot with difficult vehicle access, whereas both modular pilots had generous unloading areas.",
        "whereas 对比传统项目交通困难与模块化项目卸货空间充足，故并不相同，为 False。",
      ],
      [
        "r6",
        "IELTS reading / inference",
        "What is the modular-housing report's most defensible implication for procurement policy?",
        [
          "Require modular construction for every future plot",
          "Ignore manufacturing capacity when comparing bids",
          "Assess comparable sites before generalising about construction methods",
        ],
        2,
        "The report therefore recommended comparing projects with similar site constraints before setting citywide procurement rules.",
        "报告建议先在相似场地条件下比较，再制定全市政策，避免把场地差异误归因于施工方法。",
      ],
    ],
  },
  {
    id: "fieldwork-negotiation",
    skill: "listening",
    context:
      "Researcher: The coastal council will let us survey the dunes, but it wants a summary before the public consultation. Supervisor: Can we provide that without overstating the evidence? Researcher: We will have the vegetation counts by then, though the sediment analysis takes another month. Supervisor: Then make the summary explicitly provisional and keep claims about erosion out of it. Researcher: I also planned to compare the northern and southern sections directly. Supervisor: The northern section had new fencing last winter. That means access pressure differs as well as location. Researcher: So I should describe those sections separately? Supervisor: Yes, and record the management history. A combined average might hide the contrast that matters to the council. Researcher: What about publishing the raw locations? Supervisor: Generalise the coordinates of sensitive nesting sites. The council needs useful findings, but the public version should not direct visitors to vulnerable nests.",
    questions: [
      [
        "l1",
        "IELTS listening / provisional findings",
        "Which finding should be excluded from the coastal consultation summary for now?",
        [
          "Claims about erosion",
          "The available vegetation counts",
          "The survey's provisional status",
        ],
        0,
        "the sediment analysis takes another month. Supervisor: Then make the summary explicitly provisional and keep claims about erosion out of it.",
        "沉积物分析尚未完成，因此暂不对侵蚀作结论；可报告植被数量并标注暂定。",
      ],
      [
        "l2",
        "IELTS listening / confounding factor",
        "Why does the supervisor oppose a simple north-versus-south dune comparison?",
        [
          "Both sections have identical fencing.",
          "Recent fencing changed access pressure in the north.",
          "The council banned all vegetation counts.",
        ],
        1,
        "The northern section had new fencing last winter. That means access pressure differs as well as location.",
        "北段新增围栏改变进入压力，位置之外还存在管理差异，直接比较会混淆因素。",
      ],
      [
        "l3",
        "IELTS listening / publication decision",
        "What change does the supervisor recommend for the public version's nesting-site data?",
        [
          "Publish exact nest locations on signs",
          "Remove every vegetation result",
          "Use less precise coordinates for sensitive sites",
        ],
        2,
        "Generalise the coordinates of sensitive nesting sites.",
        "generalise coordinates 是降低坐标精确度，避免访客被引导到脆弱鸟巢，而不是删除全部结果。",
      ],
    ],
  },
  {
    id: "museum-label-study",
    skill: "listening",
    context:
      "Lecturer: Our museum study asks whether question-based labels encourage visitors to discuss exhibits. We first compared two galleries, but soon realised that one attracted school groups and the other mostly individual adults. We therefore changed the design. In the new phase, the same gallery alternates between descriptive and question-based labels on matched weekdays. Observers count conversations near selected objects without recording their content. This gives us a behavioural measure, although it cannot establish whether the discussion is historically accurate. We also log crowding because visitors may speak less when others are standing close by. A higher conversation count would support a narrow claim about engagement in that setting. It would not, by itself, demonstrate better learning or justify replacing every label in the museum. To investigate learning, we would need a separate measure that goes beyond counting speech.",
    questions: [
      [
        "l4",
        "IELTS listening / study redesign",
        "What prompted the museum researchers to stop comparing the two original galleries?",
        [
          "The labels used identical words.",
          "The galleries attracted different visitor populations.",
          "No gallery contained historical objects.",
        ],
        1,
        "one attracted school groups and the other mostly individual adults. We therefore changed the design.",
        "学校团体与成年散客的群体差异会干扰比较，因此改在同一展厅交替标签。",
      ],
      [
        "l5",
        "IELTS listening / measurement",
        "What do the observers actually measure in the revised label study?",
        [
          "The number of conversations near selected objects",
          "The historical accuracy of each discussion",
          "Each visitor's final examination score",
        ],
        0,
        "Observers count conversations near selected objects without recording their content.",
        "测量的是对话次数，未记录内容，因而不能据此判断历史准确性或学习成绩。",
      ],
      [
        "l6",
        "IELTS listening / claim boundary",
        "Which conclusion could a higher conversation count directly support in this museum study?",
        [
          "Visitors learned more historical facts.",
          "Every museum should replace its labels.",
          "The labels increased observed engagement in this setting.",
        ],
        2,
        "A higher conversation count would support a narrow claim about engagement in that setting.",
        "讲者将可支持结论限制为该情境下的参与度，学习提升需要额外测量。",
      ],
    ],
  },
];

const toeflFoundation: Material[] = [
  {
    id: "campus-map",
    skill: "foundation",
    context:
      "The student centre is next to the science building. Both buildings appear on the campus map, and the student centre has a blue entrance.",
    questions: [
      [
        "g1",
        "grammar / there is",
        "Select the grammatically correct description of the blue entrance on the campus map.",
        [
          "There are a blue entrance.",
          "There is a blue entrance.",
          "There be a blue entrance.",
        ],
        1,
        "the student centre has a blue entrance.",
        "a blue entrance 是单数，存在句用 There is；are 对应复数，be 不能直接作此处限定谓语。",
      ],
    ],
  },
  {
    id: "optional-tour",
    skill: "foundation",
    context:
      "All new students must attend the safety meeting. The evening art tour is optional: students may join it if they wish, but attendance is not required.",
    questions: [
      [
        "v1",
        "vocabulary / campus notice",
        "What does 'optional' mean for students considering the evening art tour?",
        [
          "They can choose whether to attend.",
          "They must arrive before sunrise.",
          "They are forbidden to join.",
        ],
        0,
        "students may join it if they wish, but attendance is not required.",
        "可自行决定参加且不强制，optional 表示可选择；必须参加的是安全会议。",
      ],
    ],
  },
  {
    id: "folder-location",
    skill: "foundation",
    context:
      "Leo has two folders on his desk. The green folder belongs to Sara, and the red folder belongs to Leo.",
    questions: [
      [
        "g2",
        "grammar / possessive form",
        "Complete the sentence about the green folder: 'It is ___ folder.'",
        ["Sara", "Saras", "Sara's"],
        2,
        "The green folder belongs to Sara",
        "表达所属用名词所有格 Sara's；不能直接用名字或不带撇号的 Saras。",
      ],
    ],
  },
  {
    id: "quiet-floor",
    skill: "foundation",
    context:
      "The library asks students to remain silent on the upper floor. For group discussions, they should use the rooms downstairs instead.",
    questions: [
      [
        "v2",
        "vocabulary / campus rule",
        "In the upper-floor library rule, what does 'silent' mean?",
        ["Moving very quickly", "Making no sound", "Working in large groups"],
        1,
        "For group discussions, they should use the rooms downstairs instead.",
        "讨论需去楼下，楼上要求 silent，即保持安静、不出声，并非快速移动或组队。",
      ],
    ],
  },
  {
    id: "studio-notice",
    skill: "reading",
    context:
      "Student Art Studio: Weekend Access\nThe studio will open from nine until one this Saturday. Students who want a table must reserve one through the student portal by Friday afternoon. You may bring paper, pencils and water-based paints. Oil paints are not allowed because the ventilation system is being repaired. A staff member will be present to answer questions, but no formal lesson is planned. Please clean your table before leaving. Finished work may stay on the drying rack until Monday morning. The studio will be closed on Sunday.",
    questions: [
      [
        "r1",
        "Read in Daily Life / purpose",
        "What is the main purpose of the Student Art Studio notice?",
        [
          "To sell paintings made by staff",
          "To explain rules for Saturday studio access",
          "To advertise a Sunday art lesson",
        ],
        1,
        "The studio will open from nine until one this Saturday.",
        "公告围绕周六开放时间、预约、材料和清理规则；周日不开门且无正式授课。",
      ],
      [
        "r2",
        "Read in Daily Life / detail",
        "How should a student reserve a table for the Saturday studio session?",
        [
          "Through the student portal",
          "By leaving a painting on the rack",
          "By calling on Sunday",
        ],
        0,
        "Students who want a table must reserve one through the student portal by Friday afternoon.",
        "预约渠道是学生门户，截止周五下午；晾画架不是预约方式。",
      ],
      [
        "r3",
        "Read in Daily Life / inference",
        "Which painting material can a student use during the studio's ventilation repairs?",
        [
          "Oil paint only",
          "Any paint with a strong smell",
          "Water-based paint",
        ],
        2,
        "You may bring paper, pencils and water-based paints. Oil paints are not allowed",
        "公告允许水性颜料，禁止油画颜料，因此维修期间可选择水性颜料。",
      ],
    ],
  },
  {
    id: "shade-leaves",
    skill: "reading",
    context:
      "Plants of the same species can grow different leaves in different places. In a school greenhouse experiment, young plants placed under a light screen grew broader leaves than plants beside a sunny window. The broader leaves provided a larger surface for collecting the limited light. The students gave both groups the same amount of water and used the same soil. They did not test other species, so their teacher asked them to describe the result as a pattern in the plants they studied. A single classroom experiment was not enough to show that every kind of plant responds in the same way.",
    questions: [
      [
        "r4",
        "Read an Academic Passage / detail",
        "How did the leaves beneath the greenhouse light screen differ from those near the sunny window?",
        [
          "They were broader.",
          "They were made of different soil.",
          "They received more water.",
        ],
        0,
        "young plants placed under a light screen grew broader leaves than plants beside a sunny window.",
        "对比结果是遮光组叶片更宽；土壤和水量相同。",
      ],
      [
        "r5",
        "Read an Academic Passage / vocabulary",
        "In the greenhouse passage, 'limited' light means light that is what?",
        [
          "Always colourful",
          "Available in a small amount",
          "Produced by the leaves",
        ],
        1,
        "a larger surface for collecting the limited light.",
        "遮光下光照不足，limited 在此表示有限的、数量少的，而不是彩色或叶片产生的。",
      ],
      [
        "r6",
        "Read an Academic Passage / inference",
        "Why does the teacher avoid a conclusion about every kind of plant?",
        [
          "The students used no soil.",
          "The window was closed.",
          "Only one species was tested.",
        ],
        2,
        "They did not test other species",
        "只测同一物种，证据不足以推广到所有植物，这是研究适用范围的限制。",
      ],
    ],
  },
  {
    id: "locker-conversation",
    skill: "listening",
    context:
      "Student: I need somewhere to leave my sports bag between classes. Adviser: You can rent a locker in the recreation building. Student: Do I apply at the main office? Adviser: Use the machine beside the swimming-pool desk. It prints a locker number and a temporary code. Student: How much is it? Adviser: Five dollars for the semester, plus a ten-dollar deposit. You get the deposit back when you return the key. Student: Is the building open before my eight o'clock class? Adviser: Yes, it opens at seven on weekdays. At weekends it opens at nine.",
    questions: [
      [
        "l1",
        "TOEFL listening / campus conversation",
        "Where should the student arrange to rent a recreation-building locker?",
        [
          "At the main office",
          "At the machine beside the pool desk",
          "At the weekend classroom",
        ],
        1,
        "Use the machine beside the swimming-pool desk.",
        "建议使用泳池服务台旁的机器，而不是学生先问到的主办公室。",
      ],
      [
        "l2",
        "TOEFL listening / campus fee",
        "How much is the locker rental charge, excluding the refundable deposit?",
        ["Five dollars", "Ten dollars", "Fifteen dollars"],
        0,
        "Five dollars for the semester, plus a ten-dollar deposit.",
        "实际租金五美元；十美元是可退押金，十五美元是两者合计而非租金。",
      ],
      [
        "l3",
        "TOEFL listening / campus schedule",
        "When does the recreation building open on weekdays?",
        ["At eight", "At nine", "At seven"],
        2,
        "it opens at seven on weekdays.",
        "工作日七点开门，周末才是九点，可在八点课前存包。",
      ],
    ],
  },
  {
    id: "sound-demonstration",
    skill: "listening",
    context:
      "Instructor: Today we will test how distance affects what we hear. One student will ring a small bell while the rest stand in a line at different distances. Keep your eyes closed during each test so that seeing the bell does not influence your answers. Raise your hand when you hear it. We will use the same bell and the same person to ring it each time. After three tests, we will move to a room with carpet and repeat the activity. We are comparing the responses in the two rooms, so please keep the distances unchanged.",
    questions: [
      [
        "l4",
        "TOEFL listening / academic instruction",
        "Why must students close their eyes during the bell activity?",
        [
          "To prevent visual information from affecting their answers",
          "To make the bell ring faster",
          "To help them change places secretly",
        ],
        0,
        "so that seeing the bell does not influence your answers.",
        "闭眼是控制视觉线索的影响，不是改变铃声速度或学生位置。",
      ],
      [
        "l5",
        "TOEFL listening / academic detail",
        "What will students do after completing three bell tests in the first room?",
        [
          "Replace the bell with a drum",
          "Repeat the activity in a carpeted room",
          "Measure the room's temperature",
        ],
        1,
        "After three tests, we will move to a room with carpet and repeat the activity.",
        "三次之后换到铺地毯的房间重复，铃和敲铃者保持不变。",
      ],
      [
        "l6",
        "TOEFL listening / research procedure",
        "What does the instructor ask students to keep unchanged between the two rooms?",
        ["The wall colour", "The carpet size", "Their distances from the bell"],
        2,
        "please keep the distances unchanged.",
        "为比较房间差异，学生距铃的距离不变；材料没有要求墙色或地毯面积相同。",
      ],
    ],
  },
];

const toeflIntermediate: Material[] = [
  {
    id: "seminar-obligation",
    skill: "foundation",
    context:
      "The chemistry seminar requires every participant to wear safety glasses during the demonstration. The organiser says that this is a rule, not a suggestion.",
    questions: [
      [
        "g1",
        "grammar / modal obligation",
        "Which sentence correctly expresses the chemistry seminar's compulsory eye-protection rule?",
        [
          "Participants might wear safety glasses if they feel like it.",
          "Participants must wear safety glasses.",
          "Participants cannot wear safety glasses.",
        ],
        1,
        "this is a rule, not a suggestion.",
        "must 表达强制义务；might 只是可能性，cannot 表示禁止，与规则不符。",
      ],
    ],
  },
  {
    id: "allocate-lab-time",
    skill: "foundation",
    context:
      "The lab manager will allocate two hours of microscope time to each project team. No team may use the equipment outside its assigned period without permission.",
    questions: [
      [
        "v1",
        "vocabulary / academic administration",
        "What does the manager do when she 'allocates' microscope time?",
        [
          "Distributes it for particular teams to use",
          "Cancels every team's booking",
          "Records the age of the equipment",
        ],
        0,
        "two hours of microscope time to each project team.",
        "allocate time to each team 指将使用时间分配给各组，后句 assigned period 进一步说明。",
      ],
    ],
  },
  {
    id: "relative-clause",
    skill: "foundation",
    context:
      "A professor has recommended a journal article to Nia. The article explains how to design a questionnaire and is available through the university library.",
    questions: [
      [
        "g2",
        "grammar / relative clause",
        "Complete Nia's sentence about the recommended article: 'This is the article ___ explains questionnaire design.'",
        ["who", "where", "that"],
        2,
        "The article explains how to design a questionnaire",
        "先行词 article 指物，且关系词在从句中作主语，用 that；who 指人，where 作地点状语。",
      ],
    ],
  },
  {
    id: "ambiguous-instruction",
    skill: "foundation",
    context:
      "The instruction 'submit after the second session' was ambiguous: some students understood the second lecture, while others understood the second laboratory meeting. The tutor replaced it with a specific date.",
    questions: [
      [
        "v2",
        "vocabulary / academic communication",
        "Why is the submission instruction described as 'ambiguous'?",
        [
          "It was written in two languages.",
          "It could be understood in more than one way.",
          "It required no submission.",
        ],
        1,
        "some students understood the second lecture, while others understood the second laboratory meeting.",
        "学生对同一句话有不同理解，ambiguous 指有歧义；并未说使用两种语言。",
      ],
    ],
  },
  {
    id: "equipment-email",
    skill: "reading",
    context:
      "To: Field Methods Students\nSubject: Camera checkout during the survey week\nThe equipment desk will lend waterproof cameras for your stream surveys next week. Since demand is high, each pair may reserve one camera for a maximum of forty-eight hours. Submit the online request by Wednesday at noon and include the code for your assigned field site. Requests without a site code will be returned for correction rather than placed in the booking queue.\nCollect your camera from the east entrance desk, which is temporarily replacing the usual basement counter. Bring your student card and check the battery before leaving. A charger and memory card are included. If heavy rain forces your group to postpone the survey, contact the desk before the return deadline; an extension is possible only if the camera has not been reserved by another pair.",
    questions: [
      [
        "r1",
        "Read in Daily Life / required action",
        "What must field-methods students include for their camera request to enter the booking queue?",
        [
          "A photograph of the basement",
          "Their assigned field-site code",
          "A receipt for a charger",
        ],
        1,
        "Requests without a site code will be returned for correction rather than placed in the booking queue.",
        "缺少场地代码会被退回而非排队，所以代码是进入预约队列的必要信息。",
      ],
      [
        "r2",
        "Read in Daily Life / location change",
        "Where should students collect the waterproof cameras during the survey week?",
        [
          "At the east entrance desk",
          "At the usual basement counter",
          "At their stream field site",
        ],
        0,
        "Collect your camera from the east entrance desk, which is temporarily replacing the usual basement counter.",
        "邮件明确改为东入口服务台，地下柜台是平常地点。",
      ],
      [
        "r3",
        "Read in Daily Life / inference",
        "When can the desk extend a camera loan after a rain postponement?",
        [
          "Whenever a student returns the memory card",
          "Only after all field sites close",
          "When contacted on time and no other pair has reserved that camera",
        ],
        2,
        "contact the desk before the return deadline; an extension is possible only if the camera has not been reserved by another pair.",
        "需要在截止前联系，且没有他组预约；下雨本身并不自动延长借期。",
      ],
    ],
  },
  {
    id: "conversation-timing",
    skill: "reading",
    context:
      "In an introductory study of conversation, researchers asked volunteers to answer simple questions while listening to a partner. Half the questions ended with a familiar phrase; the rest ended unexpectedly. The volunteers began their answers sooner after familiar endings. The researchers proposed that listeners sometimes prepare a response before a speaker has finished, using clues about what is likely to come next.\n\nThe experiment did not show that listeners know every word in advance. An unexpected final word often required them to revise what they had prepared, producing a longer pause. Moreover, the task used brief, factual questions in a quiet room. Ordinary conversations may involve humour, disagreement or distracting noise. The researchers therefore treated the results as evidence for one possible contribution to conversational timing, rather than a complete account of how people manage every exchange.",
    questions: [
      [
        "r4",
        "Read an Academic Passage / main idea",
        "What explanation does the conversation-timing study offer for quicker responses after familiar endings?",
        [
          "Listeners may start preparing a reply before the speaker finishes.",
          "Listeners always ignore the final word.",
          "Factual questions eliminate all pauses.",
        ],
        0,
        "listeners sometimes prepare a response before a speaker has finished",
        "熟悉结尾提供预测线索，听者可能提前组织回答；并非总能知道或忽略最后一词。",
      ],
      [
        "r5",
        "Read an Academic Passage / vocabulary",
        "In the conversation passage, 'revise' what they had prepared means to do what?",
        [
          "Speak it more loudly",
          "Change it in response to new information",
          "Write it in a different alphabet",
        ],
        1,
        "An unexpected final word often required them to revise what they had prepared, producing a longer pause.",
        "意外词带来新信息，必须修改原先准备的回答，故 revise 是调整而不是加大音量。",
      ],
      [
        "r6",
        "Read an Academic Passage / inference",
        "Which additional situation would most directly test a stated limitation of the conversation experiment?",
        [
          "Asking the same factual questions in the same quiet room",
          "Counting the chairs used by volunteers",
          "Observing exchanges with distracting background noise",
        ],
        2,
        "Ordinary conversations may involve humour, disagreement or distracting noise.",
        "原实验在安静环境中进行；加入干扰噪声可以检验结果在自然对话条件下的适用范围。",
      ],
    ],
  },
  {
    id: "residence-announcement",
    skill: "listening",
    context:
      "Residence assistant: This message is for students in Cedar Hall. The lift inspection scheduled for Wednesday has moved to Friday because the engineer's replacement part arrived late. The lift will be unavailable from ten in the morning until two in the afternoon. If you have a heavy delivery, arrange for it to arrive outside that period. Students who cannot use the stairs should contact the residence office by Thursday noon. Staff will arrange access to a ground-floor study room and help plan trips in advance. The building's water supply will operate normally; the plumbing notice you may have seen applies to Elm Hall, not Cedar Hall. We will send a message as soon as the lift is back in service.",
    questions: [
      [
        "l1",
        "TOEFL listening / announcement correction",
        "On which day will Cedar Hall's lift inspection now take place?",
        ["Wednesday", "Friday", "Thursday"],
        1,
        "The lift inspection scheduled for Wednesday has moved to Friday",
        "原定周三改为周五；周四中午是联系无障碍协助的截止时间。",
      ],
      [
        "l2",
        "TOEFL listening / recommended action",
        "What should Cedar Hall residents who cannot use stairs do?",
        [
          "Contact the residence office by Thursday noon",
          "Move permanently to Elm Hall",
          "Wait beside the lift until two",
        ],
        0,
        "Students who cannot use the stairs should contact the residence office by Thursday noon.",
        "需提前联系住宿办公室以安排一楼学习室及出行协助，不是永久搬楼。",
      ],
      [
        "l3",
        "TOEFL listening / clarified detail",
        "What does the residence assistant clarify about Cedar Hall's water supply?",
        [
          "It will stop for the entire week.",
          "It will be available only on the ground floor.",
          "It will operate normally during the lift work.",
        ],
        2,
        "The building's water supply will operate normally",
        "供水正常，另一则管道通知适用于 Elm Hall，与 Cedar Hall 电梯检查无关。",
      ],
    ],
  },
  {
    id: "navigation-talk",
    skill: "listening",
    context:
      "Professor: Imagine you are studying how animals choose a direction when several environmental signals disagree. In our computer simulation, a virtual animal can respond to a bright horizon and to a magnetic cue. We first let both cues point north, then rotate only the bright horizon. If the virtual animal changes direction, that indicates how much weight our model gives the light cue under those settings. It does not show that a real animal must behave in the same way. The simulation is useful because we can change one input at a time and inspect the consequences. Later, observations of real animals could tell us whether the model's rules are plausible. A failure to match those observations would be a reason to revise the rules, not a reason to discard the observations.",
    questions: [
      [
        "l4",
        "TOEFL listening / academic method",
        "What input does the professor change after aligning both simulated navigation cues north?",
        [
          "Only the direction of the bright horizon",
          "Both cues at the same time",
          "The number of real animals",
        ],
        0,
        "We first let both cues point north, then rotate only the bright horizon.",
        "只转动亮地平线，保留磁场线索不动，才能观察模型对光线索的权重。",
      ],
      [
        "l5",
        "TOEFL listening / function",
        "Why does the professor say the simulation cannot establish how a real animal must behave?",
        [
          "The simulation includes no adjustable inputs.",
          "Its output reflects model rules that still need testing against observations.",
          "All real animals always travel north.",
        ],
        1,
        "observations of real animals could tell us whether the model's rules are plausible.",
        "模拟输出取决于设定规则，仍需真实观察检验；不能直接当作真实动物行为的证明。",
      ],
      [
        "l6",
        "TOEFL listening / inference",
        "What response does the professor recommend if real observations conflict with the navigation model?",
        [
          "Delete the observations",
          "Claim the animal chose incorrectly",
          "Reconsider the model's rules",
        ],
        2,
        "A failure to match those observations would be a reason to revise the rules",
        "模型与观察冲突时应修正规则，而非丢弃观察或责怪动物。",
      ],
    ],
  },
];

const toeflAdvanced: Material[] = [
  {
    id: "grant-subjunctive",
    skill: "foundation",
    context:
      "The grant committee requires a separate budget statement from every applicant. Its formal recommendation uses 'that' followed by the base form of the verb.",
    questions: [
      [
        "g1",
        "grammar / mandative subjunctive",
        "Complete the grant committee's formal recommendation: 'We recommend that each applicant ___ a separate budget statement.'",
        ["submits", "submit", "submitted"],
        1,
        "uses 'that' followed by the base form of the verb.",
        "recommend that 引出的要求性虚拟语气可用动词原形，each applicant 后仍用 submit。",
      ],
    ],
  },
  {
    id: "robust-result",
    skill: "foundation",
    context:
      "The estimate remained similar when the analysts excluded small samples, altered the time window and used another reasonable calculation. They described the result as robust across those checks.",
    questions: [
      [
        "v1",
        "vocabulary / research evaluation",
        "What does 'robust' imply about the estimate under the checks described?",
        [
          "It remains fairly stable under reasonable analytical changes.",
          "It proves the theory without any uncertainty.",
          "It uses the largest possible number in every calculation.",
        ],
        0,
        "The estimate remained similar when the analysts excluded small samples, altered the time window and used another reasonable calculation.",
        "多种合理处理下估计相近，robust 表示稳健；不能扩大成绝对证明或始终最大。",
      ],
    ],
  },
  {
    id: "increasing-courses",
    skill: "foundation",
    context:
      "As more elective courses are offered, students have more opportunities to build an interdisciplinary programme. The adviser wants to express these linked increases with a comparative structure.",
    questions: [
      [
        "g2",
        "grammar / comparative correlation",
        "Complete the adviser's comparison: 'The more electives students can choose from, ___ their programme can become.'",
        ["most flexible", "flexible", "the more flexible"],
        2,
        "express these linked increases with a comparative structure.",
        "关联比较结构是 the more ..., the more ...，因此第二部分为 the more flexible。",
      ],
    ],
  },
  {
    id: "reconcile-records",
    skill: "foundation",
    context:
      "Two department records gave different totals for the same equipment purchase. The administrator reconciled them by finding a duplicated invoice and removing it from one list.",
    questions: [
      [
        "v2",
        "vocabulary / administrative reasoning",
        "What did the administrator achieve by 'reconciling' the equipment records?",
        [
          "Hiding both lists from the departments",
          "Bringing the conflicting records into agreement",
          "Replacing the purchased equipment",
        ],
        1,
        "finding a duplicated invoice and removing it from one list.",
        "找出重复发票并删除后，两套记录可以核对一致；reconcile 在此指调和不一致的账目。",
      ],
    ],
  },
  {
    id: "fellowship-email",
    skill: "reading",
    context:
      "From: Undergraduate Research Office\nSubject: Conditions for the Cross-Disciplinary Fellowship\nThis year's fellowship supports projects supervised jointly by staff from two departments. Applicants need not have studied in both departments, but both supervisors must approve the proposed work before the application is submitted. The online form closes on 6 March; a supervisor's later email will not make an incomplete application eligible.\nAwards cover documented project expenses rather than a general living allowance. If a successful applicant already holds funding for the same expense, that expense cannot also be claimed from this award. Funds are released only after the office receives the approved ethics decision or written confirmation that review is unnecessary. The award notification therefore confirms selection, not permission to begin activities requiring ethics approval. Students whose timetable changes after selection should contact the office before committing any expenditure, since a revised schedule may require a revised funding agreement.",
    questions: [
      [
        "r1",
        "Read in Daily Life / eligibility",
        "Which applicant satisfies the fellowship email's supervisory requirement?",
        [
          "A student with two departmental approvals secured before submission",
          "A student who promises to obtain a second approval after 6 March",
          "A student who studied in two departments but has no supervisor approval",
        ],
        0,
        "both supervisors must approve the proposed work before the application is submitted.",
        "关键是提交前获得两位导师批准，而非是否修读过两个院系；截止后的补信无效。",
      ],
      [
        "r2",
        "Read in Daily Life / inference",
        "What can a selected fellowship student infer about claiming an expense already paid by another grant?",
        [
          "It can automatically be claimed twice.",
          "It is excluded from this award's reimbursement.",
          "It becomes a general living allowance.",
        ],
        1,
        "If a successful applicant already holds funding for the same expense, that expense cannot also be claimed from this award.",
        "同一费用不得重复报销，因此已有其他经费覆盖的该项费用不能再向此奖学金申请。",
      ],
      [
        "r3",
        "Read in Daily Life / distinction",
        "Why does the research office distinguish an award notification from permission to begin the project?",
        [
          "Selection automatically cancels ethics review.",
          "Every project must buy equipment before review.",
          "Ethics requirements can remain outstanding after selection.",
        ],
        2,
        "The award notification therefore confirms selection, not permission to begin activities requiring ethics approval.",
        "获选只确认资助资格，伦理批准仍可能待完成，不能据此开始需要批准的活动。",
      ],
    ],
  },
  {
    id: "river-restoration",
    skill: "reading",
    context:
      "An ecological assessment examined whether reconnecting a side channel improved habitat in a heavily managed river. After the channel reopened, juvenile fish counts increased there, while counts in the main channel changed little. A simple before-and-after account might attribute the increase to the engineering work. Yet the assessment noted that the reopening coincided with two unusually wet seasons, which could independently alter both habitat access and fish movement.\n\nTo strengthen interpretation, researchers compared the restored reach with an unreconnected reach upstream and examined several years of earlier counts. The restored reach showed a larger increase, but the comparison was imperfect: the upstream reach had a different bed material and fewer shaded margins. The report treated the combined evidence as consistent with a beneficial effect, while declining to assign a precise causal share to the restoration. It recommended continued monitoring across drier years. The point was not that uncertainty made the project impossible to evaluate, but that evaluation should express how alternative explanations and imperfect comparisons constrain the strength of a conclusion.",
    questions: [
      [
        "r4",
        "Read an Academic Passage / rhetorical purpose",
        "Why does the river-restoration passage mention two unusually wet seasons?",
        [
          "To prove the engineering had no effect",
          "To identify an alternative explanation for the fish-count increase",
          "To show that no earlier counts existed",
        ],
        1,
        "the reopening coincided with two unusually wet seasons, which could independently alter both habitat access and fish movement.",
        "湿润年份本身可能影响栖息地进入和鱼类活动，是工程效果之外的解释，不能据此断言工程无效。",
      ],
      [
        "r5",
        "Read an Academic Passage / vocabulary",
        "What does 'constrain' mean in the river assessment's final sentence?",
        ["Set limits on", "Completely invent", "Publicly celebrate"],
        0,
        "alternative explanations and imperfect comparisons constrain the strength of a conclusion.",
        "替代解释和不完美的对照会限制结论强度，constrain 指约束或限制。",
      ],
      [
        "r6",
        "Read an Academic Passage / inference",
        "Which statement best matches the river assessment's position on causation?",
        [
          "Every additional fish was certainly caused by the restoration.",
          "Only a perfect comparison can provide any useful evidence.",
          "The evidence supports a possible benefit without isolating an exact causal contribution.",
        ],
        2,
        "consistent with a beneficial effect, while declining to assign a precise causal share to the restoration.",
        "证据与有益效果一致，但不足以精确分离工程的因果贡献；不确定性不等于证据毫无用途。",
      ],
    ],
  },
  {
    id: "accessibility-consultation",
    skill: "listening",
    context:
      "Student representative: The library plans to install voice-operated catalogue stations. Students welcomed the idea, but several pointed out that speaking a title aloud could reveal a sensitive research topic. Systems librarian: The supplier says the microphone can be switched off. Student representative: That helps, but the alternative controls must be equally usable. A tiny keyboard beside the microphone would not address access needs for everyone. Systems librarian: We could test large-key input and a switch interface during a pilot. Student representative: Could the pilot include students with different access requirements, rather than only staff? Systems librarian: Agreed. We should also tell participants whether any voice recordings are retained. Student representative: And ask whether they can complete the same catalogue tasks privately through the alternative controls. Systems librarian: Then our success measure should include both task completion and the ability to choose a suitable input method. Installing the equipment alone would not establish that the service is accessible.",
    questions: [
      [
        "l1",
        "TOEFL listening / campus concern",
        "What concern does the student representative raise about voice-operated catalogue searches?",
        [
          "They might expose a user's sensitive research topic.",
          "They cannot retrieve any book titles.",
          "They require all students to become library staff.",
        ],
        0,
        "speaking a title aloud could reveal a sensitive research topic.",
        "大声说出书名可能泄露敏感研究主题，是隐私顾虑，并非检索能力全失。",
      ],
      [
        "l2",
        "TOEFL listening / speaker implication",
        "Why does the representative question the supplier's microphone-off solution?",
        [
          "Microphones must stay on for every library service.",
          "Switching off speech input is insufficient unless alternatives meet users' access needs.",
          "Students prefer all keyboards to be tiny.",
        ],
        1,
        "the alternative controls must be equally usable.",
        "关闭麦克风并不能自动保证可访问性；替代输入方式也需同样可用，小键盘未必满足所有人。",
      ],
      [
        "l3",
        "TOEFL listening / agreed evaluation",
        "Which result would best satisfy the catalogue pilot's agreed success measure?",
        [
          "Staff confirm that the equipment was delivered.",
          "Every participant is required to speak aloud.",
          "Users complete catalogue tasks while choosing an input method suited to them.",
        ],
        2,
        "our success measure should include both task completion and the ability to choose a suitable input method.",
        "成功包含任务完成和合适输入方式的选择能力，单纯安装设备并不证明服务可访问。",
      ],
    ],
  },
  {
    id: "urban-archaeology-talk",
    skill: "listening",
    context:
      "Professor: When archaeologists map pottery fragments beneath a city, a dense cluster may look like the location of an ancient workshop. But fragments do not necessarily remain where pots were made or used. Later builders may move soil to level a street, carrying earlier objects with it. In today's case study, the first excavation found many fragments of the same style in one block. The team initially proposed a workshop there. Subsequent examination showed that the fragments were mixed with rubble from buildings demolished centuries later. That association weakened the original interpretation. The objects still told us something about pottery circulating in the wider settlement, but their final location was a poor guide to the workshop's position. Notice the distinction between an object's age and the date of the deposit containing it. If we collapse those two histories into one, a precise map can give an impressively detailed answer to the wrong question.",
    questions: [
      [
        "l4",
        "TOEFL listening / academic purpose",
        "Why does the archaeology professor describe builders moving soil to level streets?",
        [
          "To explain how pottery can be displaced from its original setting",
          "To date every ancient pot to a modern century",
          "To recommend that excavations avoid all streets",
        ],
        0,
        "Later builders may move soil to level a street, carrying earlier objects with it.",
        "搬土会把早期物件带到别处，说明碎片密集处不一定是原作坊所在地。",
      ],
      [
        "l5",
        "TOEFL listening / evidence revision",
        "Which discovery weakened the team's proposed workshop location in the city block?",
        [
          "Every fragment belonged to a different pottery style.",
          "The fragments were mixed with much later demolition rubble.",
          "The excavation contained no pottery at all.",
        ],
        1,
        "the fragments were mixed with rubble from buildings demolished centuries later.",
        "碎片与数百年后的拆迁瓦砾混在一起，说明可能发生二次搬运，削弱原地作坊解释。",
      ],
      [
        "l6",
        "TOEFL listening / conceptual distinction",
        "Which distinction is essential to interpreting the archaeology case correctly?",
        [
          "A map's colour versus its printing cost",
          "A workshop's size versus a street's width",
          "The age of an object versus the date of its containing deposit",
        ],
        2,
        "the distinction between an object's age and the date of the deposit containing it.",
        "器物年代不等于所在沉积层形成时间；混淆两者会使精确地图支持错误推断。",
      ],
    ],
  },
];

const bank: Record<Exam, Record<Level, Material[]>> = {
  ielts: {
    foundation: ieltsFoundation,
    intermediate: ieltsIntermediate,
    advanced: ieltsAdvanced,
  },
  toefl: {
    foundation: toeflFoundation,
    intermediate: toeflIntermediate,
    advanced: toeflAdvanced,
  },
};

export function weeklyExamPool(exam: Exam, level: Level): PracticeItem[] {
  return bank[exam][level].flatMap((material) =>
    material.questions.map(
      ([id, questionType, prompt, options, correct, evidence, explanation]) =>
        practiceItemSchema.parse({
          id: `weekly-${exam}-${level}-${id}`,
          materialId: `weekly-${exam}-${level}-${material.id}`,
          materialGroup: `weekly-${exam}-${level}-${material.id}`,
          exam,
          level,
          skill: material.skill,
          kind: "choice",
          questionType:
            material.skill === "foundation"
              ? questionType.split(" / ")[0]
              : questionType,
          context: material.context,
          prompt,
          options: [...options],
          correct,
          expected: "",
          evidence,
          explanation,
          sourceId: weeklyExamSource.id,
        }),
    ),
  );
}
