#!/usr/bin/env python3
"""Agent Bus CLI — command-line interface for the agent-bus event hub.

Usage:
    cli-anything-agent-bus publish --agent dev --project tickets --event tool_use --tool Edit
    cli-anything-agent-bus subscribe --json
    cli-anything-agent-bus replay --last 10 --json
    cli-anything-agent-bus status --json
"""

import json
import sys
import time

import click

from cli_anything.agent_bus.utils.hub_backend import (
    DEFAULT_HUB_URL,
    get_health,
    publish_event,
    read_jsonl_log,
)

_json_output = False


def _output(data, message=""):
    """Print data as JSON or human-readable."""
    if _json_output:
        click.echo(json.dumps(data, indent=2, default=str))
    elif message:
        click.echo(message)
    elif isinstance(data, dict):
        for k, v in data.items():
            click.echo(f"  {k}: {v}")
    elif isinstance(data, list):
        for item in data:
            click.echo(json.dumps(item, default=str))


@click.group(invoke_without_command=True)
@click.option("--json", "use_json", is_flag=True, help="Output as JSON")
@click.option("--hub", default=DEFAULT_HUB_URL, envvar="HUB_URL", help="Hub URL")
@click.pass_context
def cli(ctx, use_json, hub):
    """Agent Bus CLI — publish, subscribe, replay, and monitor agent events."""
    global _json_output
    _json_output = use_json
    ctx.ensure_object(dict)
    ctx.obj["hub"] = hub
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())


@cli.command()
@click.option("--agent", required=True, help="Agent identifier")
@click.option("--project", required=True, help="Project namespace")
@click.option(
    "--event",
    required=True,
    type=click.Choice(
        ["session_start", "session_end", "tool_use", "task_complete", "heartbeat"]
    ),
    help="Event type",
)
@click.option("--tool", default=None, help="Tool name (for tool_use)")
@click.option("--file", "file_path", default=None, help="File path")
@click.option("--message", default=None, help="Human-readable message")
@click.pass_context
def publish(ctx, agent, project, event, tool, file_path, message):
    """Publish an event to the hub."""
    payload = {"agent": agent, "project": project, "event": event}
    if tool:
        payload["tool"] = tool
    if file_path:
        payload["file"] = file_path
    if message:
        payload["message"] = message

    result = publish_event(ctx.obj["hub"], payload)
    if result.get("ok"):
        _output(result, f"Event published (ts={result.get('ts')})")
    else:
        _output(result, f"Error: {result.get('error', 'unknown')}")
        sys.exit(1)


@cli.command()
@click.option("--project", default=None, help="Filter by project")
@click.option("--agent", default=None, help="Filter by agent")
@click.pass_context
def subscribe(ctx, project, agent):
    """Subscribe to live events via WebSocket (Ctrl+C to stop)."""
    try:
        import websocket
    except ImportError:
        # Fallback: use raw socket if websocket-client not installed
        click.echo("Tip: pip install websocket-client for better WS support")
        click.echo("Falling back to polling /health every 2s...")
        _poll_status(ctx.obj["hub"])
        return

    hub_ws = ctx.obj["hub"].replace("http://", "ws://").replace("https://", "wss://")
    click.echo(f"Subscribing to {hub_ws} (Ctrl+C to stop)...")

    def on_message(ws, msg):
        try:
            event = json.loads(msg)
            if project and event.get("project") != project:
                return
            if agent and event.get("agent") != agent:
                return
            _output(event)
        except json.JSONDecodeError:
            pass

    def on_error(ws, error):
        click.echo(f"WS error: {error}", err=True)

    def on_close(ws, code, reason):
        click.echo(f"Disconnected (code={code})")

    ws = websocket.WebSocketApp(
        hub_ws, on_message=on_message, on_error=on_error, on_close=on_close
    )
    try:
        ws.run_forever()
    except KeyboardInterrupt:
        click.echo("\nUnsubscribed.")


def _poll_status(hub_url):
    """Fallback: poll /health when websocket-client is not installed."""
    try:
        while True:
            result = get_health(hub_url)
            _output(result)
            time.sleep(2)
    except KeyboardInterrupt:
        click.echo("\nStopped.")


@cli.command()
@click.option("--last", "last_n", default=20, help="Show last N events")
@click.option(
    "--log",
    "log_path",
    default="data/events.jsonl",
    envvar="AGENT_BUS_LOG",
    help="Path to JSONL log",
)
@click.pass_context
def replay(ctx, last_n, log_path):
    """Replay events from the JSONL log."""
    events = read_jsonl_log(log_path, last_n=last_n)
    if not events:
        _output({"events": [], "count": 0}, "No events found.")
        return
    if _json_output:
        _output({"events": events, "count": len(events)})
    else:
        click.echo(f"Showing last {len(events)} events:\n")
        for e in events:
            ts = e.get("ts", "?")
            agent = e.get("agent", "?")
            event = e.get("event", "?")
            tool = e.get("tool", "")
            extra = f" ({tool})" if tool else ""
            click.echo(f"  [{ts}] {agent}/{e.get('project','?')} {event}{extra}")


@cli.command()
@click.pass_context
def status(ctx):
    """Show hub health and connection status."""
    result = get_health(ctx.obj["hub"])
    if result.get("ok"):
        _output(
            result,
            f"Hub OK — {result.get('clients', 0)} clients, {result.get('events', 0)} events",
        )
    else:
        _output(result, f"Hub unreachable: {result.get('error', 'unknown')}")
        sys.exit(1)


def main():
    cli(auto_envvar_prefix="AGENT_BUS")


if __name__ == "__main__":
    main()
