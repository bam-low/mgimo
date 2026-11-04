"""Dependency-free checks for the repository's Markdown (Python 3.10+).

Checks inline/reference relative file links, not URL availability or fragments.
This is a basic formatting check, not a complete CommonMark parser/linter.
"""

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

REQUIRED = (
    "AGENTS.md", "README.md", "docs/PRD.md", "docs/ARCHITECTURE.md",
    "docs/DESIGN.md", "docs/DECISIONS.md", "docs/AI_LOG.md",
)
ROOT = Path(__file__).resolve().parents[1]


def check(root, names):
    errors = []
    links = 0
    documents = [name for name in names if name.lower().endswith(".md")]
    for name in REQUIRED:
        if name not in names or not (root / name).is_file():
            errors.append(f"{name}: required file missing")

    for name in documents:
        path = root / name
        try:
            raw = path.read_bytes()
            text = raw.decode("utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"{name}: unreadable UTF-8: {exc}")
            continue
        if not text.strip():
            errors.append(f"{name}: empty document")
        if text.startswith("\ufeff"):
            errors.append(f"{name}: unexpected UTF-8 BOM")
        if not text.endswith("\n") or text.endswith("\n\n"):
            errors.append(f"{name}: expected exactly one final newline")
        if "\r" in text:
            errors.append(f"{name}: use LF line endings")

        prose = []
        fence = None
        for number, line in enumerate(text.splitlines(), 1):
            location = f"{name}:{number}"
            if line.rstrip() != line:
                errors.append(f"{location}: trailing whitespace")
            if "\t" in line:
                errors.append(f"{location}: tab character")
            if re.match(r"^(<{7}|={7}|>{7})(?: |$)", line):
                errors.append(f"{location}: possible merge conflict marker")
            marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
            if marker:
                token, suffix = marker.groups()
                if fence is None:
                    fence = token
                elif token[0] == fence[0] and len(token) >= len(fence) and not suffix.strip():
                    fence = None
                continue
            if fence is None:
                if re.match(r"^ {0,3}#{1,6}[^#\s]", line):
                    errors.append(f"{location}: missing space after heading marker")
                # Ignore inline code examples when checking links.
                prose.append((number, re.sub(r"(`+).*?\1", "", line)))
        if fence:
            errors.append(f"{name}: unclosed fenced code block")

        definitions = {}
        for number, line in prose:
            definition = re.match(r"^ {0,3}\[([^]]+)\]:\s*(<[^>]+>|\S+)", line)
            if definition:
                definitions[definition[1].casefold()] = definition[2].strip("<>")
        destinations = []
        for number, line in prose:
            if re.match(r"^ {0,3}\[[^]]+\]:", line):
                continue
            # Balanced parentheses in paths and optional link titles are supported.
            inline = r'!?\[[^]\n]*\]\(\s*(<[^>\n]+>|(?:[^\s()]|\([^()]*\))*)(?:\s+"[^"\n]*")?\s*\)'
            destinations.extend((number, match[1].strip("<>")) for match in re.finditer(inline, line))
            for match in re.finditer(r"!?\[([^]\n]+)\]\[([^]\n]*)\]", line):
                label = (match[2] or match[1]).casefold()
                if label not in definitions:
                    errors.append(f"{name}:{number}: undefined link reference [{label}]")
                else:
                    destinations.append((number, definitions[label]))
            for match in re.finditer(r"(?<!!)\[([^]\n]+)\](?![\[(])", line):
                if match[1].casefold() in definitions:
                    destinations.append((number, definitions[match[1].casefold()]))

        for number, destination in destinations:
            try:
                url = urlsplit(destination)
                if url.scheme or url.netloc or not url.path:
                    continue
                target = (path.parent / unquote(url.path)).resolve()
                links += 1
                if not target.is_relative_to(root.resolve()) or not target.exists():
                    errors.append(f"{name}:{number}: broken relative link: {destination}")
            except ValueError:
                errors.append(f"{name}:{number}: invalid link: {destination}")

    return documents, links, errors


def main():
    names = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).decode("utf-8").rstrip("\0").split("\0")
    documents, links, errors = check(ROOT, names)
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        print(f"FAIL: {len(errors)} error(s)", file=sys.stderr)
        return 1
    print(f"PASS: {len(documents)} Markdown files, {len(REQUIRED)} required files, "
          f"{links} relative links; UTF-8 and basic formatting checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
