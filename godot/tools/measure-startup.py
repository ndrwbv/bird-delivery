"""Measure native process launch through the first frame drawn after applying throttle."""

import argparse
import errno
import os
import pty
import select
import subprocess
import time
from pathlib import Path


def measure(executable):
    master, slave = pty.openpty()
    start = time.perf_counter()
    process = subprocess.Popen(
        [executable, "--audio-driver", "Dummy", "--", "--benchmark", "--startup-only"],
        stdout=slave,
        stderr=slave,
    )
    os.close(slave)
    output = b""
    try:
        while time.perf_counter() - start < 20:
            if not select.select([master], [], [], 0.25)[0]:
                continue
            try:
                output += os.read(master, 4096)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if b"PLAYABLE" in output:
                elapsed = time.perf_counter() - start
                if process.wait(timeout=10) != 0:
                    raise RuntimeError(output.decode(errors="replace"))
                return elapsed
        raise RuntimeError(f"No drawn controllable frame.\n{output.decode(errors='replace')}")
    finally:
        os.close(master)
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)


if __name__ == "__main__":
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("executable", type=Path)
    command.add_argument("--runs", type=int, default=3)
    arguments = command.parse_args()
    for attempt in range(arguments.runs):
        seconds = measure(arguments.executable.resolve())
        print(f"Launch {attempt + 1}: {seconds:.3f} s", flush=True)
