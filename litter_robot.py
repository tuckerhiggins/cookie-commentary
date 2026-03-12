#!/usr/bin/env python3
import asyncio, json, os, sqlite3, sys
from datetime import datetime, timezone
from pathlib import Path

EMAIL    = os.environ.get("LITTER_ROBOT_EMAIL", "")
PASSWORD = os.environ.get("LITTER_ROBOT_PASSWORD", "")

_db_env = os.environ.get("DB_PATH", "/data/cookie.db")
DB_PATH = _db_env if Path(_db_env).parent.exists() else "/tmp/cookie.db"

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id TEXT UNIQUE NOT NULL,
            timestamp TEXT NOT NULL,
            duration_s INTEGER,
            weight_lbs REAL,
            unit_status TEXT
        )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_v_ts ON visits(timestamp)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS sabotages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id TEXT UNIQUE NOT NULL,
            timestamp TEXT NOT NULL
        )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_s_ts ON sabotages(timestamp)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS dispatches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            dispatch_type TEXT NOT NULL,
            text TEXT NOT NULL
        )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_d_ts ON dispatches(timestamp)")
    db.commit()
    return db

def today():
    return datetime.now().strftime("%Y-%m-%d")

def record_visit(data):
    db = get_db()
    db.execute("""
        INSERT OR IGNORE INTO visits (activity_id, timestamp, duration_s, weight_lbs, unit_status)
        VALUES (?,?,?,?,?)""",
        (data["activityId"], data.get("timestamp", datetime.now(timezone.utc).isoformat()),
         data.get("duration"), data.get("catWeight"), data.get("unitStatus")))
    db.commit()
    return {"ok": True}

def record_sabotage(data):
    db = get_db()
    db.execute("""
        INSERT OR IGNORE INTO sabotages (activity_id, timestamp)
        VALUES (?,?)""",
        (data["activityId"], data.get("timestamp", datetime.now(timezone.utc).isoformat())))
    db.commit()
    return {"ok": True}

def record_dispatch(dispatch_type, text):
    db = get_db()
    db.execute("""
        INSERT INTO dispatches (timestamp, dispatch_type, text)
        VALUES (?,?,?)""",
        (datetime.now(timezone.utc).isoformat(), dispatch_type, text))
    db.commit()
    return {"ok": True}

def get_recent_dispatches(limit=150):
    db = get_db()
    rows = db.execute("""
        SELECT timestamp, dispatch_type, text FROM dispatches
        ORDER BY timestamp DESC LIMIT ?""", (limit,)).fetchall()
    # Return in chronological order so the robot reads oldest → newest
    return [{"timestamp": r["timestamp"], "type": r["dispatch_type"], "text": r["text"]}
            for r in reversed(rows)]
    db = get_db()
    t = today()
    today_visits = db.execute(
        "SELECT * FROM visits WHERE date(timestamp)=? ORDER BY timestamp", (t,)).fetchall()
    visit_count = len(today_visits)
    stats = db.execute("""
        SELECT AVG(weight_lbs) avg, MIN(weight_lbs) mn, MAX(weight_lbs) mx
        FROM visits WHERE weight_lbs IS NOT NULL""").fetchone()
    recent_avg = db.execute("""
        SELECT AVG(weight_lbs) avg FROM visits
        WHERE weight_lbs IS NOT NULL AND timestamp >= datetime('now','-30 days')""").fetchone()
    prior_avg = db.execute("""
        SELECT AVG(weight_lbs) avg FROM visits
        WHERE weight_lbs IS NOT NULL
          AND timestamp >= datetime('now','-60 days')
          AND timestamp < datetime('now','-30 days')""").fetchone()
    total_visits = db.execute("SELECT COUNT(*) cnt FROM visits").fetchone()["cnt"]
    sab_rate_visits = db.execute(
        "SELECT COUNT(*) cnt FROM visits WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]
    sab_rate_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]

    weight = data.get("catWeight")
    lines = [f"Today's visits: {visit_count}"]
    if visit_count == 1: lines.append("First visit of the day.")
    if visit_count >= 5: lines.append(f"⚠️ Visit #{visit_count} today — highly unusual.")
    if data.get("duration"):
        s = int(data["duration"]); m = s // 60; s = s % 60
        lines.append(f"Duration: {f'{m}m ' if m else ''}{s}s")
    if weight:
        lines.append(f"Weight this visit: {weight:.2f} lbs")
        if stats["avg"]:
            lines.append(f"All-time average: {stats['avg']:.2f} lbs")
            lines.append(f"All-time range: {stats['mn']:.2f}–{stats['mx']:.2f} lbs")
        if recent_avg["avg"] and prior_avg["avg"]:
            delta = recent_avg["avg"] - prior_avg["avg"]
            lines.append(f"30-day trend: {'gained' if delta>0 else 'lost'} {abs(delta):.2f} lbs vs prior 30 days.")
    lines.append(f"All-time recorded visits: {total_visits}")
    if total_visits % 100 == 0 and total_visits > 0:
        lines.append(f"🎉 MILESTONE: Visit #{total_visits}!")
    if sab_rate_visits > 0:
        lines.append(f"Sabotage rate this month: {round(sab_rate_sabs/sab_rate_visits*100)}% of cycles disrupted.")
    # Live levels from robot state
    if data.get("wasteDrawerPct") is not None:
        lines.append(f"Waste drawer: {data['wasteDrawerPct']:.0f}% full")
    if data.get("litterLevelPct") is not None:
        state = data.get("litterLevelState", "")
        low_flag = " (LOW)" if state in ("LOW", "EMPTY") else ""
        lines.append(f"Litter level: {data['litterLevelPct']:.0f}%{low_flag}")
    return {"context": "\n".join(lines)}

def context_sabotage():
    db = get_db()
    t = today()
    today_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE date(timestamp)=?", (t,)).fetchone()["cnt"]
    total_sabs = db.execute("SELECT COUNT(*) cnt FROM sabotages").fetchone()["cnt"]
    sab_rate_visits = db.execute(
        "SELECT COUNT(*) cnt FROM visits WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]
    sab_rate_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]
    lines = [f"Times she has interfered today: {today_sabs}"]
    if today_sabs > 1: lines.append("She is on a streak of interference today.")
    lines.append(f"All-time sabotage incidents: {total_sabs}")
    if total_sabs % 25 == 0 and total_sabs > 0:
        lines.append(f"🚨 MILESTONE: {total_sabs}th sabotage incident.")
    if sab_rate_visits > 0:
        lines.append(f"Sabotage rate this month: {round(sab_rate_sabs/sab_rate_visits*100)}%")
    return {"context": "\n".join(lines)}

async def get_robots():
    from pylitterbot import Account
    account = Account()
    try:
        await account.connect(username=EMAIL, password=PASSWORD, load_robots=True)
        return [{
            "litterRobotId":  str(r.id),
            "name":           r.name,
            "unitStatus":     str(r.status.value) if r.status else None,
            "wasteDrawerPct": float(r.waste_drawer_level) if r.waste_drawer_level is not None else None,
            "litterLevelPct": float(r.litter_level) if r.litter_level is not None else None,
            "litterLevelState": r.litter_level_state.value if r.litter_level_state else None,
        } for r in account.robots]
    finally:
        await account.disconnect()

async def get_activity(robot_id):
    from pylitterbot import Account
    account = Account()
    try:
        await account.connect(username=EMAIL, password=PASSWORD, load_robots=True)
        robot = next((r for r in account.robots if str(r.id) == robot_id), None)
        if not robot: return []
        history = await robot.get_activity_history(limit=50)
        # pet_weight comes from current robot state; LR4 API doesn't provide per-activity weight
        weight = float(robot.pet_weight) if robot.pet_weight else None
        result = []
        for a in history:
            action = a.action
            status_value = action.value if hasattr(action, "value") else str(action)
            result.append({
                "activityId":  a.timestamp.isoformat() if a.timestamp else None,
                "timestamp":   a.timestamp.isoformat() if a.timestamp else None,
                "unitStatus":  status_value,
                "catWeight":   weight,
                "catDetected": status_value in ("CD", "RDY", "CST", "CSI", "CSF", "BR"),
                "duration":    None,
            })
        return result
    finally:
        await account.disconnect()

def context_digest():
    """Morning digest context: overnight activity summary."""
    db = get_db()
    t = today()
    # Yesterday
    yesterday = db.execute("""
        SELECT COUNT(*) cnt, AVG(weight_lbs) avg_w FROM visits
        WHERE date(timestamp) = date('now','-1 day')""").fetchone()
    # Last 24h visits
    recent = db.execute("""
        SELECT timestamp, weight_lbs, unit_status FROM visits
        WHERE timestamp >= datetime('now','-24 hours')
        ORDER BY timestamp DESC LIMIT 10""").fetchall()
    today_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE timestamp >= datetime('now','-24 hours')").fetchone()["cnt"]
    total_visits = db.execute("SELECT COUNT(*) cnt FROM visits").fetchone()["cnt"]
    weight_recent = db.execute("""
        SELECT AVG(weight_lbs) avg FROM visits
        WHERE weight_lbs IS NOT NULL AND timestamp >= datetime('now','-7 days')""").fetchone()

    lines = ["=== OVERNIGHT SUMMARY ==="]
    lines.append(f"Visits in last 24h: {yesterday['cnt']}")
    if yesterday["avg_w"]:
        lines.append(f"Average weight (24h): {yesterday['avg_w']:.2f} lbs")
    if today_sabs:
        lines.append(f"Cycle interruptions in last 24h: {today_sabs}")
    if weight_recent["avg"]:
        lines.append(f"7-day average weight: {weight_recent['avg']:.2f} lbs")
    lines.append(f"All-time recorded visits: {total_visits}")
    if recent:
        lines.append("Recent activity (latest first):")
        for r in recent[:5]:
            lines.append(f"  {r['timestamp']}: {r['unit_status']} / {r['weight_lbs']} lbs")
    return {"context": "\n".join(lines)}

def anomaly_context():
    """Check for health anomalies worth alerting on."""
    db = get_db()
    alerts = {}

    # Weight anomaly: 7-day avg vs prior 7-day avg, flag if >5% change
    recent_w = db.execute("""
        SELECT AVG(weight_lbs) avg, COUNT(*) cnt FROM visits
        WHERE weight_lbs IS NOT NULL AND timestamp >= datetime('now','-7 days')""").fetchone()
    prior_w = db.execute("""
        SELECT AVG(weight_lbs) avg, COUNT(*) cnt FROM visits
        WHERE weight_lbs IS NOT NULL
          AND timestamp >= datetime('now','-14 days')
          AND timestamp < datetime('now','-7 days')""").fetchone()

    if recent_w["cnt"] >= 3 and prior_w["cnt"] >= 3 and prior_w["avg"]:
        delta_pct = (recent_w["avg"] - prior_w["avg"]) / prior_w["avg"] * 100
        if abs(delta_pct) >= 5:
            alerts["weightAlert"] = {
                "recentAvg": round(recent_w["avg"], 2),
                "priorAvg":  round(prior_w["avg"], 2),
                "changePct": round(delta_pct, 1),
            }

    # Visit frequency anomaly: today vs 14-day daily average
    today_count = db.execute(
        "SELECT COUNT(*) cnt FROM visits WHERE date(timestamp) = date('now')").fetchone()["cnt"]
    avg_daily = db.execute("""
        SELECT COUNT(*) * 1.0 / 14 avg FROM visits
        WHERE timestamp >= datetime('now','-14 days')""").fetchone()["avg"] or 0

    if avg_daily > 0 and today_count > 0:
        if today_count > avg_daily * 2.5 or (today_count == 0 and avg_daily > 1):
            alerts["frequencyAlert"] = {
                "todayCount": today_count,
                "avgDaily":   round(avg_daily, 1),
            }

    return alerts if alerts else None

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "robots":
        print(json.dumps(asyncio.run(get_robots())))
    elif cmd == "activity":
        print(json.dumps(asyncio.run(get_activity(sys.argv[2]))))
    elif cmd == "record_visit":
        print(json.dumps(record_visit(json.loads(sys.argv[2]))))
    elif cmd == "record_sabotage":
        print(json.dumps(record_sabotage(json.loads(sys.argv[2]))))
    elif cmd == "context_visit":
        data = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        print(json.dumps(context_visit(data)))
    elif cmd == "context_sabotage":
        print(json.dumps(context_sabotage()))
    elif cmd == "record_dispatch":
        data = json.loads(sys.argv[2])
        print(json.dumps(record_dispatch(data["type"], data["text"])))
    elif cmd == "get_recent_dispatches":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 150
        print(json.dumps(get_recent_dispatches(limit)))
    elif cmd == "anomaly_context":
        print(json.dumps(anomaly_context()))
    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))

main()
