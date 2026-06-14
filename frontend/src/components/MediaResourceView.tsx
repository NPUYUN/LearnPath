"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import MarkdownPreview from "@/components/MarkdownPreview";

type MediaResourceViewProps = {
  content: string;
  title: string;
  topic?: string;
};

function extractVideoUrl(content: string): string | null {
  const block = content.match(/```video\n([\s\S]*?)```/);
  if (block) return block[1].trim();
  const inline = content.match(/(\/api\/media\/videos\/[^\s`)]+)/);
  return inline ? inline[1] : null;
}

function extractPosterSvg(content: string): string | null {
  const m = content.match(/```svg\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

function extractPosterImage(content: string): string | null {
  const cover = content.match(/##\s*讲解封面[\s\S]*?!\[[^\]]*\]\(([^)]+)\)/i);
  if (cover) return cover[1];
  const first = content.match(/!\[[^\]]*\]\((\/api\/media\/images\/[^)]+)\)/);
  return first ? first[1] : null;
}

function extractSlideshowImages(content: string): string[] {
  const urls = Array.from(content.matchAll(/!\[[^\]]*\]\((\/api\/media\/images\/[^)]+)\)/g)).map(
    (m) => m[1]
  );
  return Array.from(new Set(urls));
}

function stripHeroSection(content: string): string {
  return content
    .replace(/##\s*讲解视频[\s\S]*?```video\n[\s\S]*?```\s*/i, "")
    .replace(/##\s*讲解封面[\s\S]*?(```svg\n[\s\S]*?```|!\[[^\]]*\]\([^)]+\))\s*/i, "")
    .trim();
}

function MediaSlideshow({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || images.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [playing, images.length]);

  if (images.length === 0) return null;

  return (
    <div className="lp-media-slideshow">
      <div className="lp-media-slideshow-head">
        <span className="lp-media-slideshow-label">分镜幻灯片</span>
        <span className="lp-media-slideshow-counter">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          className="lp-media-slideshow-play"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "暂停" : "播放"}
        </button>
      </div>
      <div className="lp-media-slideshow-stage">
        {images.map((src, i) => (
          <img
            key={src}
            src={apiUrl(src)}
            alt={`${title} 分镜 ${i + 1}`}
            className={`lp-media-slideshow-frame${i === index ? " is-active" : ""}`}
          />
        ))}
        <div className="lp-media-slideshow-vignette" aria-hidden />
      </div>
      {images.length > 1 && (
        <div className="lp-media-slideshow-dots">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={`lp-media-slideshow-dot${i === index ? " is-active" : ""}`}
              aria-label={`第 ${i + 1} 镜`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaVideoPlayer({ src, title }: { src: string; title: string }) {
  return (
    <div className="lp-media-video-wrap">
      <div className="lp-media-slideshow-head">
        <span className="lp-media-slideshow-label">讲解视频</span>
        <span className="lp-media-slideshow-counter">通义万相 · 图生视频</span>
      </div>
      <video
        className="lp-media-video"
        src={apiUrl(src)}
        controls
        playsInline
        preload="metadata"
        aria-label={`${title} 讲解视频`}
      />
    </div>
  );
}

function MediaResourceViewInner({ content, title, topic }: MediaResourceViewProps) {
  const videoUrl = useMemo(() => extractVideoUrl(content), [content]);
  const posterSvg = useMemo(() => extractPosterSvg(content), [content]);
  const posterImage = useMemo(() => extractPosterImage(content), [content]);
  const slideshowImages = useMemo(() => extractSlideshowImages(content), [content]);
  const bodyContent = useMemo(() => stripHeroSection(content), [content]);

  const showSlideshow = slideshowImages.length >= 2;

  return (
    <div className="lp-media-resource">
      {videoUrl && <MediaVideoPlayer src={videoUrl} title={title} />}

      {!videoUrl && showSlideshow ? (
        <MediaSlideshow images={slideshowImages} title={title} />
      ) : !videoUrl && posterImage ? (
        <div className="lp-media-resource-hero lp-media-resource-hero--photo">
          <img
            src={apiUrl(posterImage)}
            alt={`${title} 讲解封面`}
            className="lp-media-resource-photo"
          />
          <div className="lp-media-resource-hero-meta">
            <span className="lp-media-resource-badge">通义万相 AI 配图</span>
            {topic && <span className="lp-media-resource-topic">{topic}</span>}
          </div>
        </div>
      ) : (
        !videoUrl &&
        posterSvg && (
          <div className="lp-media-resource-hero">
            <div
              className="lp-media-resource-poster"
              dangerouslySetInnerHTML={{ __html: posterSvg }}
              aria-label={`${title} 讲解封面`}
            />
            <div className="lp-media-resource-hero-meta">
              <span className="lp-media-resource-badge">多模态讲解</span>
              {topic && <span className="lp-media-resource-topic">{topic}</span>}
            </div>
          </div>
        )
      )}

      {videoUrl && showSlideshow && (
        <MediaSlideshow images={slideshowImages} title={title} />
      )}

      <MarkdownPreview content={bodyContent} />
    </div>
  );
}

export default memo(MediaResourceViewInner);
