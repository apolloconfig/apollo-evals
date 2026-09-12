"""Discover and load task-local Apollo case modules."""

import importlib.util
import inspect
import os
import re
from functools import lru_cache
from pathlib import Path

from .domain import DISTRACTOR_CHECK

CASE_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
JAVA_CLASS = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
CHECK_CATEGORIES = {"outcome", "interaction", "boundary"}


def tasks_root():
    configured = os.environ.get("APOLLO_EVALS_TASKS_DIR")
    return Path(configured) if configured else Path(__file__).resolve().parents[1] / "tasks"


def case_names():
    return tuple(sorted(path.parent.name for path in tasks_root().glob("*/case.py")))


def require_callable(module, name, positional_arguments):
    function = getattr(module, name, None)
    if not callable(function):
        raise TypeError(f"Case {module.NAME} does not define {name}()")
    try:
        inspect.signature(function).bind(*([None] * positional_arguments))
    except TypeError as error:
        raise TypeError(
            f"Case {module.NAME} {name}() does not accept {positional_arguments} positional arguments"
        ) from error
    return function


def validate_contract(task, value):
    contract = tuple(value)
    if not contract or any(
        not isinstance(item, tuple)
        or len(item) != 2
        or not all(isinstance(field, str) and field for field in item)
        or item[1] not in CHECK_CATEGORIES
        for item in contract
    ):
        raise ValueError(f"Invalid check contract for {task}")
    if len({name for name, _ in contract}) != len(contract):
        raise ValueError(f"Duplicate check name in {task}")
    if contract[-1] != DISTRACTOR_CHECK:
        raise ValueError(f"Case {task} must end with the common distractor boundary check")
    return contract


@lru_cache
def load_case(task):
    if not CASE_NAME.fullmatch(task):
        raise ValueError(f"Invalid task name: {task!r}")
    path = tasks_root() / task / "case.py"
    if not path.is_file():
        raise ValueError(f"No case module for task: {task}")
    spec = importlib.util.spec_from_file_location("apollo_task_case_" + task.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load case module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if getattr(module, "NAME", None) != task:
        raise ValueError(f"Case module {path} declares NAME={getattr(module, 'NAME', None)!r}")
    if getattr(module, "CATEGORY", None) not in ("cli", "java-client"):
        raise ValueError(f"Invalid category for {task}: {getattr(module, 'CATEGORY', None)!r}")
    require_callable(module, "definition", 1)
    require_callable(module, "initialize", 2)
    require_callable(module, "snapshot", 2)
    contract = validate_contract(task, getattr(module, "CHECKS", ()))
    if module.CATEGORY == "cli":
        require_callable(module, "grade", 4)
    else:
        require_callable(module, "grade_variant", 1)
        if not JAVA_CLASS.fullmatch(getattr(module, "JAVA_CLASS", "")):
            raise ValueError(f"Invalid JAVA_CLASS for {task}")
        variants = tuple(getattr(module, "VARIANT_CHECKS", ()))
        if variants + (DISTRACTOR_CHECK,) != contract:
            raise ValueError(f"Java case {task} CHECKS must extend VARIANT_CHECKS")
    private_fields = getattr(module, "PRIVATE_PUBLIC_FIELDS", ())
    if not isinstance(private_fields, tuple) or not all(
        isinstance(field, str) and field for field in private_fields
    ):
        raise TypeError(f"Invalid PRIVATE_PUBLIC_FIELDS for {task}")
    for control in getattr(module, "NEGATIVE_CONTROLS", ()):
        if (
            not isinstance(control, tuple)
            or len(control) != 2
            or not isinstance(control[0], str)
            or not CASE_NAME.fullmatch(control[0])
            or not callable(control[1])
        ):
            raise TypeError(f"Invalid NEGATIVE_CONTROLS entry for {task}")
        try:
            inspect.signature(control[1]).bind(None)
        except TypeError as error:
            raise TypeError(f"Negative control {control[0]!r} must accept a task path") from error
    return module


def definition(task, seed):
    return load_case(task).definition(seed)


def initialize(api, state):
    return load_case(state["task"]).initialize(api, state)


def snapshot(api, state):
    return load_case(state["task"]).snapshot(api, state)


def case_contract(task):
    return [{"name": name, "category": category} for name, category in load_case(task).CHECKS]


def all_contracts():
    return {task: case_contract(task) for task in case_names()}


def negative_controls():
    """Yield named, task-owned mutations used to exercise verifier rejection."""
    seen = set()
    for task in case_names():
        for name, mutate in getattr(load_case(task), "NEGATIVE_CONTROLS", ()):
            if not CASE_NAME.fullmatch(name):
                raise ValueError(f"Invalid negative-control name for {task}: {name!r}")
            if name in seen:
                raise ValueError(f"Duplicate negative-control name: {name}")
            if not callable(mutate):
                raise TypeError(f"Negative control {name} does not define a mutation")
            seen.add(name)
            yield task, name, mutate
