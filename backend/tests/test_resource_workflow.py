from __future__ import annotations

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from app.models.schemas import ClassroomGenerateRequest, ClassroomInteractionRequest, GenerateResourcesRequest
from app.services import resource_job_service
from app.services.classroom_service import _fallback_interaction, _resolve_selected_resources
from app.services.resource_service import _attach_resources_to_path, update_library_resource_manifest
from app.services.resource_template_service import (
    create_resources_from_template,
    list_resource_templates,
)


class ResourceWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_template_center_lists_builtin_templates(self) -> None:
        templates = list_resource_templates()
        ids = {template.id for template in templates}
        self.assertIn("ml-core-concepts", ids)
        self.assertIn("python-basic-syntax", ids)

    async def test_create_from_template_persists_resources(self) -> None:
        saved = AsyncMock()
        recorded = AsyncMock()
        with patch("app.services.resource_template_service.save_resources", saved), patch(
            "app.services.resource_template_service.record_event",
            recorded,
        ):
            result = await create_resources_from_template("u1", "ml-core-concepts")
        self.assertEqual(result.template_id, "ml-core-concepts")
        self.assertEqual(len(result.resources), 4)
        self.assertTrue(all(resource.generation_mode == "template" for resource in result.resources))
        saved.assert_awaited_once()
        recorded.assert_awaited_once()

    async def test_create_from_template_supports_copy_before_edit(self) -> None:
        saved = AsyncMock()
        recorded = AsyncMock()
        with patch("app.services.resource_template_service.save_resources", saved), patch(
            "app.services.resource_template_service.record_event",
            recorded,
        ):
            result = await create_resources_from_template(
                "u1",
                "ml-core-concepts",
                copy_title="机器学习期末冲刺",
                topic_override="监督学习核心概念",
            )
        self.assertTrue(all("机器学习期末冲刺" in resource.title for resource in result.resources))
        self.assertTrue(all(resource.topic == "监督学习核心概念" for resource in result.resources))
        recorded.assert_awaited_once()
        event_kwargs = recorded.await_args.kwargs
        self.assertEqual(event_kwargs["meta"]["template_title"], "机器学习期末冲刺")
        self.assertEqual(event_kwargs["meta"]["topic_override"], "监督学习核心概念")

    async def test_classroom_quick_question_stays_on_current_slide(self) -> None:
        result = _fallback_interaction(
            ClassroomInteractionRequest(
                action="qa",
                question="这页一句话总结",
                slide={
                    "title": "梯度下降的学习率",
                    "body": "学习率决定每次参数更新的步长。",
                    "board": ["步长过大会震荡", "步长过小会收敛慢"],
                },
                knowledge_point="学习率",
            )
        )

        self.assertEqual(result.action, "qa")
        self.assertIn("梯度下降的学习率", result.body)
        self.assertIn("参数更新的步长", result.body)

    async def test_generated_resource_is_written_to_source_library_manifest(self) -> None:
        library = {
            "id": "lib-1",
            "user_id": "u1",
            "name": "高数资料库",
            "synthesis": {"resource_manifest": [], "resource_index": {}},
        }
        resource = {
            "id": "res-1",
            "type": "doc",
            "title": "一阶微分方程讲义",
            "topic": "一阶微分方程",
            "status": "published",
            "metadata": {
                "source_library_id": "lib-1",
                "knowledge_points": ["伯努利方程"],
                "learning_purpose": "explain",
                "difficulty": "intermediate",
                "quality_score": 8.6,
            },
        }
        saved = AsyncMock()
        with patch("app.services.resource_service.get_library", AsyncMock(return_value=library)), patch(
            "app.services.resource_service.save_library", saved
        ):
            await update_library_resource_manifest("u1", "lib-1", [resource])
        payload = saved.await_args.args[0]
        self.assertEqual(payload["synthesis"]["resource_manifest"][0]["id"], "res-1")
        self.assertEqual(payload["synthesis"]["resource_manifest"][0]["quality_score"], 8.6)

    async def test_auto_attach_updates_matching_path_step(self) -> None:
        path = {
            "user_id": "u1",
            "steps": [
                {"id": "s1", "order": 1, "title": "导数基础", "objective": "掌握导数", "resource_ids": []},
                {"id": "s2", "order": 2, "title": "梯度下降", "objective": "应用梯度更新", "resource_ids": []},
            ],
        }
        resource = {
            "id": "res-2",
            "status": "published",
            "topic": "梯度下降",
            "metadata": {"knowledge_points": ["梯度下降"], "path_step_key": ""},
        }
        saved = AsyncMock()
        with patch("app.services.resource_service.get_path", AsyncMock(return_value=path)), patch(
            "app.services.resource_service.save_path", saved
        ):
            attached = await _attach_resources_to_path("u1", [resource])
        self.assertEqual(attached[0]["metadata"]["path_step_key"], "s2")
        self.assertEqual(path["steps"][1]["resource_ids"], ["res-2"])
        saved.assert_awaited_once()

    async def test_resource_generation_job_reports_result_summary(self) -> None:
        async def fake_stream(_req):
            yield {"event": "progress", "data": json.dumps({"stage": "quiz", "progress": 45, "resource_type": "quiz"})}
            yield {"event": "resources", "data": json.dumps([{"id": "r1", "type": "quiz", "title": "题集"}])}
            yield {
                "event": "done",
                "data": json.dumps(
                    {
                        "count": 1,
                        "published_count": 1,
                        "draft_count": 0,
                        "rewritten_count": 1,
                        "library_id": "lib-1",
                        "library_name": "课程库",
                        "path_attached_count": 1,
                        "path_unmatched_count": 0,
                        "classroom_ready_count": 1,
                        "progress": 100,
                    }
                ),
            }

        req = GenerateResourcesRequest(user_id="u1", topic="梯度下降", resource_types=["quiz"])
        with patch.object(resource_job_service, "stream_generate_resources", fake_stream):
            job = resource_job_service.create_resource_generation_job(req)
            for _ in range(20):
                if job.status in {"done", "error"}:
                    break
                await asyncio.sleep(0.01)
        self.assertEqual(job.status, "done")
        self.assertEqual(job.result.resource_ids, ["r1"])
        self.assertEqual(job.result.path_attached_count, 1)
        self.assertEqual(job.result.rewritten_count, 1)

    async def test_classroom_prefers_current_path_bound_resource(self) -> None:
        resources = [
            {
                "id": "bound",
                "title": "梯度下降课堂例题",
                "topic": "梯度下降",
                "content": "例题与详解",
                "library_id": "lib-1",
                "status": "published",
                "metadata": {"quality_score": 9, "used_for": ["classroom"], "learning_purpose": "explain"},
            },
            {
                "id": "other",
                "title": "通用机器学习说明",
                "topic": "机器学习",
                "content": "概念说明",
                "status": "published",
                "metadata": {"quality_score": 9, "used_for": ["classroom"], "learning_purpose": "explain"},
            },
        ]
        path = {
            "steps": [
                {"id": "step-2", "title": "梯度下降", "objective": "掌握更新", "resource_ids": ["bound"], "substeps": []}
            ]
        }
        req = ClassroomGenerateRequest(user_id="u1", step_key="step-2", title="优化算法", objective="掌握更新")
        with patch("app.services.classroom_service.list_resources", AsyncMock(return_value=resources)), patch(
            "app.services.classroom_service.get_path", AsyncMock(return_value=path)
        ):
            selected = await _resolve_selected_resources(req)
        self.assertEqual(selected[0]["id"], "bound")


if __name__ == "__main__":
    unittest.main()
