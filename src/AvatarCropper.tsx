import { useEffect, useRef, useState } from "react";
import { AVATAR_MAX_BYTES } from "../shared/member-profile";
import { localize as t } from "./i18n";

export function AvatarCropper({
  file,
  onApply,
  onCancel,
}: {
  file: File;
  onApply: (data: string) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    let active = true;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    void img
      .decode()
      .then(() => {
        if (
          !img.naturalWidth ||
          !img.naturalHeight ||
          img.naturalWidth * img.naturalHeight > 40_000_000
        )
          throw new Error();
        if (active) setImage(img);
      })
      .catch(() => {
        if (active)
          setError(t("画像を読み込めませんでした。別の画像を選んでください。"));
      });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
      element.close();
    };
  }, [file]);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const side = image
    ? Math.min(image.naturalWidth, image.naturalHeight) / zoom
    : 1;
  const apply = () => {
    if (!image) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 256, 256);
      context.drawImage(
        image,
        ((image.naturalWidth - side) * (position.x + 1)) / 2,
        ((image.naturalHeight - side) * (position.y + 1)) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      // Re-encoding strips source metadata; the displayed circle uses this square.
      const data = canvas.toDataURL("image/jpeg", 0.85);
      if (data.length * 0.75 > AVATAR_MAX_BYTES) throw new Error();
      onApply(data);
    } catch {
      setError(t("画像を読み込めませんでした。別の画像を選んでください。"));
    }
  };
  return (
    <dialog
      ref={dialog}
      className="avatar-crop-dialog"
      aria-labelledby="avatar-crop-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="avatar-crop-title">{t("プロフィール画像を調整")}</h2>
      <p>{t("画像を動かして、丸の中に収めてね。")}</p>
      {!image && !error && <p role="status">{t("画像を準備中…")}</p>}
      {image && (
        <>
          <div
            className="avatar-crop-viewport"
            aria-label={t("切り抜きプレビュー")}
            onPointerDown={(event) => {
              if (event.button !== 0 || drag.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
            }}
            onPointerMove={(event) => {
              const previous = drag.current;
              if (!previous || previous.id !== event.pointerId) return;
              const width = event.currentTarget.getBoundingClientRect().width;
              const dx = (image.naturalWidth / side) * width - width;
              const dy = (image.naturalHeight / side) * width - width;
              setPosition((p) => ({
                x:
                  dx > 0
                    ? clamp(p.x - (2 * (event.clientX - previous.x)) / dx)
                    : 0,
                y:
                  dy > 0
                    ? clamp(p.y - (2 * (event.clientY - previous.y)) / dy)
                    : 0,
              }));
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: `${(image.naturalWidth / side) * 100}%`,
                height: `${(image.naturalHeight / side) * 100}%`,
                left: `${(1 - image.naturalWidth / side) * (position.x + 1) * 50}%`,
                top: `${(1 - image.naturalHeight / side) * (position.y + 1) * 50}%`,
              }}
            />
          </div>
          <label>
            {t("拡大")}
            <input
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label>
            {t("左右の位置")}
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={position.x}
              onChange={(e) =>
                setPosition((p) => ({ ...p, x: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            {t("上下の位置")}
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={position.y}
              onChange={(e) =>
                setPosition((p) => ({ ...p, y: Number(e.target.value) }))
              }
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="avatar-crop-actions">
        <button type="button" onClick={onCancel}>
          {t("キャンセル")}
        </button>
        <button type="button" disabled={!image || !!error} onClick={apply}>
          {t("この範囲を使う")}
        </button>
      </div>
    </dialog>
  );
}
