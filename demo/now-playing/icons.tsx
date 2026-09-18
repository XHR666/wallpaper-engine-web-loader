/* ①(P-138 2026-09-19 移植) icons.tsx —— **离线兜底**图标。
   上游图标本应由 lucide-react 提供；本机装不下来（网络失败/离线）时，
   build.mjs 用 esbuild 的 alias 把裸包名 `lucide-react` 换成本文件
   （`node build.mjs --icons=fallback` 可强制走这条路），所以两条路都能 build。

   口径与 lucide 对齐：
     · 24×24 viewBox、stroke="currentColor"、strokeWidth 默认 2、
       strokeLinecap/Linejoin 都是 round、fill 默认 none（调用方可以覆盖）；
     · class 写 `lucide lucide-<name>` —— now-playing.css 里
       `.snd-like[data-on] .lucide { animation: snd-beat … }` 认的就是它；
     · props 与 lucide-react 同形（size / strokeWidth / fill / className + 透传）。

   几何数据逐字节取自 **lucide-react@1.47.0**（本机实装版本，
   `node_modules/lucide-react/dist/esm/icons/{heart,skip-back,skip-forward}.mjs`）。

   许可：ISC（Lucide 上游许可）。本仓库已有同一份许可正文
   `demo/LICENSE-lucide-ISC.txt`（覆盖 demo/bench-patch.js 内联的 7 个图标），
   归属与版本另见 THIRD-PARTY.md。*/
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
  strokeWidth?: number | string;
};

const base = (
  name: string,
  { size = 24, strokeWidth = 2, className, fill, ...rest }: IconProps,
  children: ReactNode,
) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ?? "none"}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ? `lucide lucide-${name} ${className}` : `lucide lucide-${name}`}
    {...rest}
  >
    {children}
  </svg>
);

/* lucide-react@1.47.0/icons/heart.mjs */
export const Heart = (props: IconProps) =>
  base(
    "heart",
    props,
    <path
      d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
    />,
  );

/* lucide-react@1.47.0/icons/skip-back.mjs */
export const SkipBack = (props: IconProps) =>
  base(
    "skip-back",
    props,
    <>
      <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" />
      <path d="M3 20V4" />
    </>,
  );

/* lucide-react@1.47.0/icons/skip-forward.mjs */
export const SkipForward = (props: IconProps) =>
  base(
    "skip-forward",
    props,
    <>
      <path d="M21 4v16" />
      <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />
    </>,
  );
