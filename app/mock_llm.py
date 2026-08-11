from __future__ import annotations

import random
import time
import os
from dataclasses import dataclass
from typing import Any

from .incidents import STATE
from .tracing import observe


@dataclass
class FakeUsage:
    input_tokens: int
    output_tokens: int


@dataclass
class FakeResponse:
    text: str
    usage: FakeUsage
    model: str


class FakeLLM:
    def __init__(self, model: str = "claude-sonnet-4-5") -> None:
        self.model = model

    @observe(name="llm.generate", as_type="generation", capture_input=False, capture_output=False)
    def generate(
        self,
        prompt: str,
        *,
        metadata: dict[str, Any],
        managed_prompt: Any | None,
        langfuse_client: Any,
    ) -> FakeResponse:
        """Generate the answer as a child generation without storing prompt text."""
        time.sleep(0.15)
        input_tokens = max(20, len(prompt) // 4)
        output_tokens = random.randint(80, 180)
        if STATE["cost_spike"]:
            output_tokens *= 4
        # Cost guard: cap completion tokens before calculating billable cost.
        max_output_tokens = int(os.getenv("MAX_OUTPUT_TOKENS", "720"))
        output_tokens = min(output_tokens, max_output_tokens)
        answer = (
            "Starter answer. Teams should improve this output logic and add better quality checks. "
            "Use retrieved context and keep responses concise."
        )
        usage = FakeUsage(input_tokens, output_tokens)
        cost_usd = round((input_tokens / 1_000_000) * 3 + (output_tokens / 1_000_000) * 15, 6)
        langfuse_client.update_current_generation(
            model=self.model,
            metadata=metadata,
            usage_details={
                "prompt_tokens": usage.input_tokens,
                "completion_tokens": usage.output_tokens,
            },
            cost_details={"total": cost_usd},
            prompt=managed_prompt,
        )
        return FakeResponse(text=answer, usage=usage, model=self.model)
