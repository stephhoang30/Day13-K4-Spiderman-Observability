from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import langfuse

from app import tracing
from app.mock_llm import FakeLLM
from app.mock_rag import retrieve


class TracingAdapterTests(unittest.TestCase):
    def test_adapter_uses_the_installed_langfuse_v3_api(self) -> None:
        self.assertEqual(tracing.observe.__module__, langfuse.observe.__module__)
        client = tracing.get_langfuse_client()
        self.assertTrue(callable(client.update_current_trace))
        self.assertTrue(callable(client.update_current_generation))

    def test_tracing_is_disabled_without_both_keys(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(tracing.tracing_enabled())

    def test_rag_and_llm_are_observed_as_independent_subcomponents(self) -> None:
        # The Langfuse decorator preserves __wrapped__; this guards against
        # accidentally removing the child spans needed for CP3 investigation.
        self.assertTrue(callable(retrieve.__wrapped__))
        self.assertTrue(callable(FakeLLM.generate.__wrapped__))

        with patch.dict(os.environ, {"LANGFUSE_PUBLIC_KEY": "pk-only"}, clear=True):
            self.assertFalse(tracing.tracing_enabled())


if __name__ == "__main__":
    unittest.main()
