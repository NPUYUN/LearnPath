"""
RAG（检索增强生成）管道
基于 ChromaDB 向量数据库实现知识库检索

TODO（开发者任务）：
1. 实现 EmbeddingClient（使用讯飞 Embedding API 或 sentence-transformers）
2. 实现 chunk_documents() 文档分块逻辑
3. 实现 add_documents() 批量导入文档
4. 完善 retrieve() 的混合检索（向量 + 关键词）
5. 添加检索结果的溯源信息返回
"""
import os
from typing import List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from backend.core.config import settings


class RAGPipeline:
    """
    RAG 检索增强生成管道
    
    使用方式：
        rag = RAGPipeline()
        context = rag.retrieve("什么是反向传播算法？")
        # 将 context 拼接到 LLM prompt 中
    """

    def __init__(self):
        # 初始化 ChromaDB 持久化客户端
        self.client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def retrieve(
        self,
        query: str,
        top_k: int = None,
        filter_metadata: Optional[dict] = None,
    ) -> str:
        """
        根据查询检索相关知识片段
        
        Args:
            query: 用户查询文本
            top_k: 返回的最大结果数
            filter_metadata: 元数据过滤条件（如 {"chapter": 2}）
        
        Returns:
            str: 拼接后的上下文文本，可直接插入 LLM prompt
        
        TODO:
        - 实现真实的向量嵌入查询（当前使用占位符）
        - 添加相关性评分过滤（score < threshold 的结果丢弃）
        """
        top_k = top_k or settings.RAG_TOP_K

        # TODO: 用真实 embedding 替换这里的 query_texts
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where=filter_metadata,
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return ""

        # 格式化检索结果为上下文字符串
        context_parts = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            source = f"[来源: {meta.get('title', '未知')} - 第{meta.get('chapter', '?')}章]"
            context_parts.append(f"{source}\n{doc}")

        return "\n\n---\n\n".join(context_parts)

    def add_documents(
        self,
        texts: List[str],
        metadatas: List[dict],
        ids: List[str],
    ) -> None:
        """
        向知识库添加文档
        
        Args:
            texts: 文档文本列表
            metadatas: 对应的元数据（chapter, title, keywords 等）
            ids: 唯一 ID 列表
        
        TODO: 实现批量嵌入调用（避免逐条请求）
        """
        self.collection.add(
            documents=texts,
            metadatas=metadatas,
            ids=ids,
        )

    def get_collection_stats(self) -> dict:
        """返回知识库统计信息"""
        return {
            "total_documents": self.collection.count(),
            "collection_name": settings.CHROMA_COLLECTION_NAME,
        }


# 全局单例
rag_pipeline = RAGPipeline()
