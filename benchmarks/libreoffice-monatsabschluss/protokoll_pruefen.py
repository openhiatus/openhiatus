"""Werkzeugprotokoll eines ausdrücklich gewählten openhiatus-Threads prüfen.

Nur der Testleiter nutzt dieses Skript. Das Ergebnis ist kein vollständiger
Nachweis gegen außerhalb des protokollierten Threads ausgeführte Handlungen.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import re
import sys


UI_ACTIONS = {"screenshot", "click", "type", "key", "scroll", "move", "drag"}
CONTROL_TOOLS = {"sleep", "get_goal", "update_goal", "create_goal", "request_user_input", "request_user_input_async"}
PROHIBITED_TOOLS = {"exec_command", "shell_command", "shell", "apply_patch", "read_file", "write_file", "python", "python_exec"}


def log_lines(log: Path):
    with log.open(encoding="utf-8-sig") as stream:
        yield from enumerate(stream, start=1)


def inspect(log: Path) -> dict:
    names = Counter()
    call_types = Counter()
    actions = Counter()
    prohibited = []
    unknown = []
    malformed = 0
    timestamps = []
    call_ids = set()
    agent_start = agent_end = None
    for line_number, line in log_lines(log):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            malformed += 1
            continue
        payload = row.get("payload", {})
        if not isinstance(payload, dict):
            continue
        if row.get("type") == "event_msg":
            if payload.get("type") == "task_started" and agent_start is None:
                agent_start = row.get("timestamp")
            if payload.get("type") == "task_complete":
                agent_end = row.get("timestamp")
        kind = payload.get("type")
        if row.get("type") != "response_item" or kind not in {"function_call", "custom_tool_call"}:
            continue
        call_id = payload.get("call_id")
        if call_id and call_id in call_ids:
            continue
        if call_id:
            call_ids.add(call_id)
        name = payload.get("name", "")
        names[name] += 1
        call_types[kind] += 1
        short = re.split(r"[.:]", name)[-1]
        if row.get("timestamp"):
            timestamps.append(row["timestamp"])
        if kind == "custom_tool_call":
            # Free-form code needs human review even if its tool name looks
            # like an allowed UI/control tool. Never execute it here.
            unknown.append({
                "at": row.get("timestamp"), "tool": name,
                "call_id": call_id, "line": line_number,
                "reason": "Freiform-Werkzeugaufruf vollständig im Protokoll manuell prüfen",
                "input_preview": str(payload.get("input", ""))[:2000],
            })
        elif short == "computer":
            try:
                arguments = payload.get("arguments", "{}")
                if isinstance(arguments, str):
                    arguments = json.loads(arguments)
                action = arguments.get("action")
                if action not in UI_ACTIONS:
                    raise ValueError("Nicht erkannte Bildschirmaktion")
                actions[action] += 1
            except (json.JSONDecodeError, AttributeError, ValueError):
                unknown.append({"at": row.get("timestamp"), "tool": name, "reason": "Bildschirmargumente nicht prüfbar"})
        elif short in PROHIBITED_TOOLS:
            prohibited.append({"at": row.get("timestamp"), "tool": name, "reason": "Im Arbeitsauftrag ausdrücklich verbotenes Werkzeug"})
        elif short not in CONTROL_TOOLS:
            # Code-mode wrappers can contain either UI calls or file operations.
            # They need human inspection; do not classify by keywords in text.
            unknown.append({"at": row.get("timestamp"), "tool": name, "reason": "Werkzeugvertrag/Argumente manuell prüfen"})
    duration = None
    start, end = agent_start, agent_end
    if start and end:
        duration = (datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()
    status = "failed" if prohibited else "manual" if unknown or malformed or not names else "no_logged_violation"
    return {
        "log": str(log.resolve()), "ui_only_status": status,
        "tool_counts": dict(names), "ui_action_counts": dict(actions),
        "tool_call_types": dict(call_types),
        "screenshots_explizit": actions["screenshot"],
        "hinweis_screenshots": "openhiatus liefert nach Eingaben weitere Bilder. Explizite Screenshot-Aufrufe sind nicht die Gesamtzahl der Bilder.",
        "start": start, "ende": end, "dauer_sekunden": duration,
        "first_tool_at": timestamps[0] if timestamps else None,
        "last_tool_at": timestamps[-1] if timestamps else None,
        "prohibited_tool_calls": prohibited, "manual_tool_calls": unknown,
        "unlesbare_protokollzeilen": malformed,
        "limits": [
            "Keine vollständige Bestehensentscheidung: visuellen Verlauf und unbekannte Werkzeuge prüfen.",
            "Auch Texteingaben im Bildschirmwerkzeug müssen geprüft werden: Terminal-/Makro-/Skriptumwege bleiben verboten.",
            "Ein fehlender protokollierter Verstoß ist kein Beweis für außerhalb dieses Threads ausgeführte Aktionen.",
            "Fehlbedienungen und erfolgreiche Wiederherstellungen werden anhand des sichtbaren Verlaufs manuell bewertet.",
        ],
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    location = parser.add_mutually_exclusive_group(required=True)
    location.add_argument("--log", type=Path)
    location.add_argument("--thread-id")
    parser.add_argument("--sessions", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.log:
        log = args.log
    else:
        if not args.sessions:
            parser.error("--thread-id erfordert --sessions; keinen beliebigen letzten Thread auswerten.")
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", args.thread_id):
            parser.error("Ungültige Thread-ID")
        matches = list(args.sessions.rglob(f"*{args.thread_id}.jsonl"))
        if len(matches) != 1:
            parser.error(f"Genau ein Protokoll erwartet, gefunden: {len(matches)}")
        log = matches[0]
    if args.output and args.output.resolve() == log.resolve():
        parser.error("Das Werkzeugprotokoll darf nicht überschrieben werden.")
    try:
        report = inspect(log)
        result = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(result, encoding="utf-8")
        else:
            print(result)
    except (OSError, ValueError) as exc:
        parser.exit(2, f"Fehler: {exc}\n")


if __name__ == "__main__":
    main()
