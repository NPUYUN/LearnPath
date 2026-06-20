type QuizQuestion = {
  id?: string;
  stem?: string;
  options?: string[];
  answer?: number | string;
  explanation?: string;
  type?: string;
};

type QuizPayload = {
  questions?: QuizQuestion[];
};

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function escapeBareJsonBackslashes(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = value[index + 1] || "";
    if (next === "\\" || next === '"' || next === "/") {
      output += `\\${next}`;
      index += 1;
      continue;
    }
    if (next === "u" && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 2, index + 6))) {
      output += value.slice(index, index + 6);
      index += 5;
      continue;
    }

    // LLM 常把 LaTeX 的 \frac、\theta 等直接写进 JSON 字符串。
    output += "\\\\";
  }
  return output;
}

function repairQuizJson(value: string): string {
  const normalizedQuotes = value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const unwrappedMathLines = normalizedQuotes
    .replace(/(^|\n)\s*\$\$\s*(?=")/g, "$1")
    .replace(/"\s*,\s*\$\$/g, '",')
    .replace(/"\s*\$\$/g, '"')
    .replace(/,\s*([}\]])/g, "$1");
  return escapeBareJsonBackslashes(unwrappedMathLines);
}

function parseQuizPayload(content: string): { payload: QuizPayload; source: string } | null {
  const fencedBlocks = Array.from(content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  const fenced = fencedBlocks.find((match) => /["“]questions["”]\s*:/.test(match[1] || ""));

  const candidates: Array<{ source: string; json: string }> = [];
  if (fenced?.[0] && fenced[1]) {
    candidates.push({ source: fenced[0], json: fenced[1] });
  }

  const questionIndex = content.search(/["“]questions["”]\s*:/);
  if (questionIndex >= 0) {
    const start = content.lastIndexOf("{", questionIndex);
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      candidates.push({ source: content.slice(start, end + 1), json: content.slice(start, end + 1) });
    }
  }

  for (const candidate of candidates) {
    for (const json of [candidate.json, repairQuizJson(candidate.json)]) {
      try {
        const payload = JSON.parse(json) as QuizPayload;
        if (Array.isArray(payload.questions) && payload.questions.length > 0) {
          return { payload, source: candidate.source };
        }
      } catch {
        // 继续尝试修复后的候选内容。
      }
    }
  }
  return null;
}

function cleanOption(option: string, label: string): string {
  let value = String(option || "").trim();
  if (value.startsWith("$$") && value.endsWith("$$")) {
    value = value.slice(2, -2).trim();
  }
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value
    .replace(new RegExp(`^\\s*${escapedLabel}\\s*[.．、:：)]\\s*`, "i"), "")
    .trim();
}

function answerLabel(answer: number | string | undefined, optionCount: number): string {
  if (typeof answer === "number" && answer >= 0 && answer < optionCount) {
    return OPTION_LABELS[answer] || String(answer + 1);
  }
  if (typeof answer !== "string") return "";
  const trimmed = answer.trim();
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed);
    return index >= 0 && index < optionCount ? OPTION_LABELS[index] || trimmed : trimmed;
  }
  return trimmed.replace(/[.．、:：)]/g, "").toUpperCase();
}

function explicitExplanationAnswer(explanation: string): string {
  return (
    explanation.match(/(?:正确答案|答案|应选|故选|所以选)\s*(?:是|为|：|:)?\s*([A-DTF])\b/i)?.[1] || ""
  ).toUpperCase();
}

function isValidJsonQuestion(question: QuizQuestion): boolean {
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = answerLabel(question.answer, options.length);
  const judgment = /judge|true.?false|判断/i.test(String(question.type || "")) || options.length === 2;
  if (judgment) {
    if (!['T', 'F', 'A', 'B'].includes(answer)) return false;
  } else if (!answer || !OPTION_LABELS.slice(0, options.length).includes(answer)) {
    return false;
  }
  const explanation = String(question.explanation || "").trim();
  if (!explanation) return false;
  const supported = explicitExplanationAnswer(explanation);
  return !supported || supported === answer;
}

function filterInvalidMarkdownQuestions(content: string, invalidNumbers: number[] = []): string {
  const blocked = new Set(invalidNumbers);
  const matches = Array.from(content.matchAll(/^#{2,4}\s*第\s*(\d+)\s*题[^\n]*/gm));
  if (!matches.length) return content;
  const parts: string[] = [content.slice(0, matches[0].index || 0)];
  matches.forEach((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || content.length : content.length;
    const block = content.slice(start, end);
    const number = Number(match[1]);
    const options = Array.from(
      block.matchAll(/^\s*(?:[-*]\s*)?(?:\*\*)?([A-D])\s*[.．、:：)](?:\*\*)?\s+/gmi),
    ).map((m) => m[1].toUpperCase());
    const answer = (block.match(/(?:\*\*)?答案(?:\*\*)?\s*[：:]\s*(?:\*\*)?([A-DTF])/i)?.[1] || "").toUpperCase();
    const explanation = block.match(/(?:详细解析|详解|解析)(?:\*\*)?\s*[：:]?\s*([\s\S]*?)(?=\n\s*(?:\*\*)?(?:选项诊断|误区诊断)|$)/i)?.[1] || "";
    const supported = explicitExplanationAnswer(explanation);
    const obviousConflict = Boolean(supported && answer && supported !== answer);
    // 解析失败不能等同于题目无效：历史题集常用 `A. 选项`，新题集常用 `- **A.** 选项`。
    const answerMissing = Boolean(answer) && options.length > 0 && !options.includes(answer) && !['T', 'F'].includes(answer);
    if (!blocked.has(number) && !obviousConflict && !answerMissing) parts.push(block);
  });
  return parts.join("").trim();
}

export function quizJsonToMarkdown(content: string): string | null {
  const parsed = parseQuizPayload(content);
  if (!parsed) return null;

  const intro = content.replace(parsed.source, "").trim();
  const questions = (parsed.payload.questions || []).filter(isValidJsonQuestion);
  const lines = intro ? [intro, "", "# 练习与自测", ""] : ["# 练习与自测", ""];
  const answers: string[] = [];

  questions.forEach((question, questionIndex) => {
    const stem = String(question.stem || "题目")
      .trim()
      .replace(/^\s*(?:第\s*\d+\s*题[：:、.．)\s]*|\d+\s*[.．、)]\s*)/, "");
    const options = Array.isArray(question.options) ? question.options : [];
    lines.push(`## 第 ${questionIndex + 1} 题：${stem}`, "");
    options.forEach((option, optionIndex) => {
      const label = OPTION_LABELS[optionIndex] || String(optionIndex + 1);
      lines.push(`- **${label}.** ${cleanOption(String(option), label)}`);
    });
    lines.push("");

    const label = answerLabel(question.answer, options.length);
    if (label) {
      const explanation = String(question.explanation || "").trim();
      answers.push(`${questionIndex + 1}. **${label}**${explanation ? ` — ${explanation}` : ""}`);
    }
  });

  if (answers.length > 0) {
    lines.push("## 参考答案", "", ...answers, "");
  }

  return lines.join("\n").trim();
}

/** 将历史测验 JSON 转成与普通学习资料一致的静态 Markdown。 */
export function formatResourceContentForDisplay(
  type: string,
  content: string,
  invalidQuestionNumbers: number[] = [],
): string {
  if (type !== "quiz") return content;
  return quizJsonToMarkdown(content) || filterInvalidMarkdownQuestions(content, invalidQuestionNumbers);
}
