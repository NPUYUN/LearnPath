"""Normalize generated Markdown and LaTeX before review and persistence."""

from __future__ import annotations

import re


LATEX_COMMANDS = (
    "frac|dfrac|tfrac|sum|prod|int|lim|sqrt|sin|cos|tan|log|ln|cdot|times|"
    "left|right|infty|partial|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|"
    "vec|overline|underline|text|mathrm|mathbf|displaystyle|to|quad|qquad|nabla"
)
_LATEX_COMMAND_RE = re.compile(rf"\\(?:{LATEX_COMMANDS})(?![A-Za-z])")


def _protect_code(text: str) -> tuple[str, list[str]]:
    protected: list[str] = []

    def hold(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"\x00CODE{len(protected) - 1}\x00"

    text = re.sub(r"```[\s\S]*?```", hold, text)
    text = re.sub(r"`[^`\n]+`", hold, text)
    return text, protected


def _restore_code(text: str, protected: list[str]) -> str:
    return re.sub(
        r"\x00CODE(\d+)\x00",
        lambda match: protected[int(match.group(1))],
        text,
    )


def normalize_latex_markdown(content: str) -> str:
    """Repair escaped delimiters/commands and convert them for remark-math."""
    if not content:
        return ""
    text, protected = _protect_code(content.replace("\r\n", "\n"))

    # JSON/string escaping often leaves two or more slashes before TeX tokens.
    text = re.sub(r"\\{2,}(?=[()[\]])", r"\\", text)
    text = re.sub(rf"\\{{2,}}(?=(?:{LATEX_COMMANDS})(?![A-Za-z]))", r"\\", text)

    # remark-math consumes dollar delimiters consistently across all surfaces.
    text = re.sub(r"\\\(([\s\S]*?)\\\)", lambda m: f"${m.group(1).strip()}$", text)
    text = re.sub(r"\\\[([\s\S]*?)\\\]", lambda m: f"$${m.group(1).strip()}$$", text)

    # Legacy LLM output often uses ordinary parentheses around clear TeX.
    text = re.sub(
        r"\(\s*([^()\n]{1,260}\\(?:" + LATEX_COMMANDS + r")[^()\n]{0,260})\s*\)",
        lambda m: f"${m.group(1).strip()}$",
        text,
    )

    # Keep display blocks on their own lines so Markdown parsers do not treat them as text.
    text = re.sub(r"(?<!\n)\s*(\$\$[\s\S]*?\$\$)", r"\n\n\1", text)
    text = re.sub(r"(\$\$[\s\S]*?\$\$)\s*(?!\n)", r"\1\n\n", text)
    return _restore_code(text, protected).strip()


def formula_quality_issues(content: str) -> list[str]:
    """Return visible/rendering risks after normalization."""
    text, _ = _protect_code(content)
    issues: list[str] = []
    if re.search(r"\\{2,}(?:" + LATEX_COMMANDS + r")", text):
        issues.append("公式含多余反斜杠转义")
    if re.search(r"\\[()[\]]", text):
        issues.append("公式仍含未规范化的 LaTeX 定界符")

    display_blocks = re.findall(r"\$\$[\s\S]*?\$\$", text)
    without_display = re.sub(r"\$\$[\s\S]*?\$\$", "", text)
    inline_blocks = re.findall(r"(?<!\$)\$[^$\n]+\$(?!\$)", without_display)
    without_math = re.sub(r"(?<!\$)\$[^$\n]+\$(?!\$)", "", without_display)
    if text.count("$$") % 2 or without_display.count("$") % 2:
        issues.append("数学公式定界符未成对")
    if _LATEX_COMMAND_RE.search(without_math):
        issues.append("LaTeX 命令位于数学公式定界符之外")
    if any(not block.strip("$").strip() for block in [*display_blocks, *inline_blocks]):
        issues.append("存在空数学公式")
    return list(dict.fromkeys(issues))
