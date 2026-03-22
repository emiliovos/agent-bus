#!/usr/bin/env python3
"""setup.py for cli-anything-agent-bus"""

from setuptools import setup, find_namespace_packages

setup(
    name="cli-anything-agent-bus",
    version="1.0.0",
    author="cli-anything contributors",
    description="CLI harness for Agent Bus — publish, subscribe, replay, and monitor agent events via the event hub",
    url="https://github.com/HKUDS/CLI-Anything",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    python_requires=">=3.10",
    install_requires=[
        "click>=8.0.0",
    ],
    extras_require={
        "ws": ["websocket-client>=1.0.0"],
        "dev": ["pytest>=7.0.0"],
    },
    entry_points={
        "console_scripts": [
            "cli-anything-agent-bus=cli_anything.agent_bus.agent_bus_cli:main",
        ],
    },
    package_data={
        "cli_anything.agent_bus": ["skills/*.md"],
    },
    include_package_data=True,
    zip_safe=False,
)
