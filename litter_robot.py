#!/usr/bin/env python3
# litter_robot.py
# Called by litterRobot.js via child_process. Outputs JSON to stdout.

import asyncio
import json
import os
import sys

from pylitterbot import Account

EMAIL    = os.environ["LITTER_ROBOT_EMAIL"]
PASSWORD = os.environ["LITTER_ROBOT_PASSWORD"]
COMMAND  = sys.argv[1] if len(sys.argv) > 1 else "robots"
ROBOT_ID = sys.argv[2] if len(sys.argv) > 2 else None

async def main():
    account = Account()
    try:
        await account.connect(username=EMAIL, password=PASSWORD, load_robots=True)

        if COMMAND == "robots":
            robots = []
            for r in account.robots:
                robots.append({
                    "litterRobotId": str(r.id),
                    "name": r.name,
                    "unitStatus": str(r.status.value) if r.status else None,
                })
            print(json.dumps(robots))

        elif COMMAND == "activity":
            robot = next((r for r in account.robots if str(r.id) == ROBOT_ID), None)
            if not robot:
                print(json.dumps([]))
                return

            activity = await robot.get_activity()
            result = []
            for a in (activity or []):
                result.append({
                    "activityId":   str(a.timestamp.timestamp()) if a.timestamp else None,
                    "timestamp":    a.timestamp.isoformat() if a.timestamp else None,
                    "unitStatus":   str(a.status.value) if a.status else None,
                    "catWeight":    float(a.cat_weight) if a.cat_weight else None,
                    "catDetected":  a.cat_detected if hasattr(a, "cat_detected") else False,
                    "duration":     int(a.duration.total_seconds()) if hasattr(a, "duration") and a.duration else None,
                })
            print(json.dumps(result))

    finally:
        await account.disconnect()

asyncio.run(main())
