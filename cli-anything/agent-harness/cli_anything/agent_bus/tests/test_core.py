"""Unit tests for agent-bus CLI core functionality."""

import json
import os
import tempfile

import pytest
from click.testing import CliRunner

from cli_anything.agent_bus.agent_bus_cli import cli
from cli_anything.agent_bus.utils.hub_backend import read_jsonl_log


@pytest.fixture
def runner():
    return CliRunner()


class TestCLIHelp:
    def test_help_shows_commands(self, runner):
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "publish" in result.output
        assert "subscribe" in result.output
        assert "replay" in result.output
        assert "status" in result.output

    def test_no_args_shows_help(self, runner):
        result = runner.invoke(cli, [])
        assert result.exit_code == 0
        assert "Agent Bus CLI" in result.output

    def test_publish_help(self, runner):
        result = runner.invoke(cli, ["publish", "--help"])
        assert result.exit_code == 0
        assert "--agent" in result.output
        assert "--event" in result.output


class TestPublishValidation:
    def test_publish_requires_agent(self, runner):
        result = runner.invoke(cli, ["publish", "--project", "x", "--event", "heartbeat"])
        assert result.exit_code != 0

    def test_publish_requires_project(self, runner):
        result = runner.invoke(cli, ["publish", "--agent", "x", "--event", "heartbeat"])
        assert result.exit_code != 0

    def test_publish_requires_event(self, runner):
        result = runner.invoke(cli, ["publish", "--agent", "x", "--project", "y"])
        assert result.exit_code != 0

    def test_publish_rejects_invalid_event_type(self, runner):
        result = runner.invoke(
            cli, ["publish", "--agent", "x", "--project", "y", "--event", "invalid"]
        )
        assert result.exit_code != 0


class TestReplay:
    def test_replay_empty_log(self, runner):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("")
            path = f.name
        try:
            result = runner.invoke(cli, ["replay", "--log", path])
            assert result.exit_code == 0
            assert "No events" in result.output
        finally:
            os.unlink(path)

    def test_replay_with_events(self, runner):
        events = [
            {"ts": 1000, "agent": "dev", "project": "p", "event": "tool_use", "tool": "Edit"},
            {"ts": 2000, "agent": "dev", "project": "p", "event": "session_end"},
        ]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            for e in events:
                f.write(json.dumps(e) + "\n")
            path = f.name
        try:
            result = runner.invoke(cli, ["replay", "--log", path])
            assert result.exit_code == 0
            assert "dev" in result.output
            assert "tool_use" in result.output
        finally:
            os.unlink(path)

    def test_replay_last_n(self, runner):
        events = [
            {"ts": i, "agent": "dev", "project": "p", "event": "heartbeat"}
            for i in range(10)
        ]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            for e in events:
                f.write(json.dumps(e) + "\n")
            path = f.name
        try:
            result = runner.invoke(cli, ["--json", "replay", "--log", path, "--last", "3"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["count"] == 3
            assert len(data["events"]) == 3
        finally:
            os.unlink(path)

    def test_replay_json_output(self, runner):
        events = [
            {"ts": 1000, "agent": "qa", "project": "test", "event": "session_start"},
        ]
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            for e in events:
                f.write(json.dumps(e) + "\n")
            path = f.name
        try:
            result = runner.invoke(cli, ["--json", "replay", "--log", path])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["count"] == 1
            assert data["events"][0]["agent"] == "qa"
        finally:
            os.unlink(path)

    def test_replay_missing_log(self, runner):
        result = runner.invoke(cli, ["replay", "--log", "/nonexistent/path.jsonl"])
        assert result.exit_code == 0
        assert "No events" in result.output


class TestReadJsonlLog:
    def test_read_empty_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            path = f.name
        try:
            assert read_jsonl_log(path) == []
        finally:
            os.unlink(path)

    def test_read_events(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"ts":1,"agent":"a","project":"p","event":"heartbeat"}\n')
            f.write('{"ts":2,"agent":"b","project":"p","event":"heartbeat"}\n')
            path = f.name
        try:
            events = read_jsonl_log(path)
            assert len(events) == 2
            assert events[0]["agent"] == "a"
        finally:
            os.unlink(path)

    def test_read_last_n(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            for i in range(5):
                f.write(json.dumps({"ts": i, "agent": "x", "project": "p", "event": "heartbeat"}) + "\n")
            path = f.name
        try:
            events = read_jsonl_log(path, last_n=2)
            assert len(events) == 2
            assert events[0]["ts"] == 3
        finally:
            os.unlink(path)

    def test_read_nonexistent_file(self):
        assert read_jsonl_log("/nonexistent") == []
