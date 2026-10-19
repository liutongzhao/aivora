"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Check, Image as ImageIcon } from "lucide-react";
import { getDesktopDownload, getDesktopPlatform } from "../../../../lib/desktop-download";

type Annotation = { label: string; text: string; top: string; left: string };
type GuideStep = { title: string; kicker: string; summary: string; image: string; imageAlt: string; annotations?: Annotation[]; notes: string[]; action?: { href: string; label: string }; gallery?: { src: string; alt: string; label: string }[] };

const steps: GuideStep[] = [
  { title: "下载桌面端", kicker: "01 / 准备工作", summary: "Web 端负责账号和配置，桌面端负责截图、快捷键和搜题。先安装与你的系统匹配的客户端。", image: "/guide/latest-models.png", imageAlt: "最新桌面端模型配置界面", annotations: [{ label: "A", text: "安装后打开桌面端，从左侧进入模型配置。", top: "20%", left: "16%" }], notes: ["macOS 用户下载 .dmg，Windows 用户下载 .exe。", "安装完成后，使用与 Web 端相同的账号登录桌面端。"], action: { href: "https://download.aivora.cuzisme.cn/Aivora-latest.dmg", label: "下载桌面端" } },
  { title: "配置模型", kicker: "02 / 必做设置", summary: "模型是搜题时负责识别图片和生成答案的服务。你可以直接使用管理员配置的内置模型，也可以添加自己的模型。", image: "/guide/latest-models.png", imageAlt: "最新桌面端模型配置页面", annotations: [{ label: "A", text: "内置模型：直接选择使用，显示剩余次数，不可编辑。", top: "26%", left: "17%" }, { label: "B", text: "添加模型：填写地址和密钥后选择模型保存。", top: "39%", left: "87%" }, { label: "C", text: "测试模型只验证调用，不消耗内置模型次数。", top: "50%", left: "75%" }], notes: ["自定义模型需要支持图片识别，否则无法完成截图搜题。", "添加模型不会自动改变题型分配，下一步需要选择题型默认模型。"], action: { href: "/dashboard/settings", label: "打开模型设置" } },
  { title: "分配题型模型", kicker: "03 / 推荐设置", summary: "模型列表和题型分配是两件事。添加模型后，在题型分配中选择每类题目实际使用的模型。", image: "/guide/latest-routing.png", imageAlt: "最新桌面端题型分配页面", annotations: [{ label: "A", text: "先切换到题型分配标签。", top: "26%", left: "40%" }, { label: "B", text: "为编程题、单选题、多选题等分别选择模型。", top: "51%", left: "67%" }], notes: ["没有内置模型时，需要先添加自己的模型，再为题型分配。", "不同题型可以使用不同模型，按你的模型能力和速度选择即可。"], action: { href: "/dashboard/settings", label: "查看题型分配" } },
  { title: "设置快捷键", kicker: "04 / 提升效率", summary: "先用截图快捷键把当前屏幕加入队列，再按对应题型快捷键开始识别。不要跳过截图这一步。Mac 和 Windows 的组合键可能不同，以下以 Mac 为例，实际请以桌面端当前设置为准。", image: "/guide/latest-shortcuts.png", imageAlt: "最新桌面端快捷键设置页面", annotations: [{ label: "A", text: "截图：Mac 示例为 ⌘⇧H。", top: "48%", left: "67%" }, { label: "B", text: "单选/多选：截图后再按对应搜题快捷键。", top: "65%", left: "71%" }, { label: "C", text: "在快捷键测试区确认设置已经生效。", top: "15%", left: "79%" }], notes: ["截图：先捕获题目画面。", "Mac 示例：单选题截图后按 ⌘⇧M；多选题截图后按桌面端显示的多选快捷键。", "Windows 通常使用 Ctrl、Shift 等组合键，不能直接照搬 Mac 的 ⌘；请以实际设置为准。", "隐藏考试界面和退出考试界面也建议单独记住，考试时可以快速切换显示状态。"] },
  { title: "正式使用与第一次搜题", kicker: "05 / 开始使用", summary: "从首页点击“开始使用”，先选择考试客户端主题，建议使用黑色主题。进入题目后，按照小窗口提示完成第一次搜题：先截图，再按题型快捷键，最后等待答案。", image: "/guide/latest-theme.png", imageAlt: "选择考试客户端主题，黑色主题为推荐选项", annotations: [{ label: "A", text: "从首页点击“开始使用”，打开主题选择窗口。", top: "17%", left: "84%" }, { label: "B", text: "建议选择黑色主题，低光环境下更专注。", top: "48%", left: "40%" }], notes: ["第一步：在首页点击“开始使用”。", "第二步：选择黑色主题，进入考试客户端。", "第三步：看到题目后，先按截图快捷键，再按对应题型快捷键。", "Mac 单选题示例：截图（⌘⇧H）→ 按单选搜题（⌘⇧M）→ 等待答案。", "Windows 的快捷键组合与 Mac 不同，请以桌面端小窗口显示的快捷键为准。", "完整截取题目和选项，识别结果会更稳定。"], gallery: [{ src: "/guide/latest-question.jpg", alt: "考试页面中的单选题", label: "1. 打开题目" }, { src: "/guide/latest-analysis.jpg", alt: "桌面端正在分析截图内容", label: "2. 截图后按单选键" }, { src: "/guide/latest-answer.jpg", alt: "桌面端显示单选题答案和解析", label: "3. 等待答案" }] },
  { title: "提示词按需配置", kicker: "06 / 可选设置", summary: "提示词不是必填项。不配置时直接使用系统默认提示词；有特殊答题格式或语言要求时，再按题型补充。", image: "/guide/latest-prompts.png", imageAlt: "最新桌面端提示词设置页面", annotations: [{ label: "A", text: "在提示词标签中按题型维护自己的要求。", top: "29%", left: "57%" }, { label: "B", text: "不配置也可以直接使用默认提示词。", top: "24%", left: "17%" }], notes: ["建议先使用默认提示词，确认流程正常后再调整。", "提示词影响回答格式和侧重点，不会改变模型连接。"], action: { href: "/dashboard/settings", label: "打开提示词设置" } },
];

export default function GuidePage() {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const platform = typeof navigator === "undefined" ? "unknown" : getDesktopPlatform(navigator.userAgent);
  const download = getDesktopDownload(platform);
  return <main className="container guide-page">
    <header className="guide-heading"><div><span className="eyebrow">QUICK START</span><h1>快速上手</h1><p>跟着 6 个步骤完成配置和第一次搜题，按顺序操作即可开始使用。</p></div><div className="guide-heading-meta"><ImageIcon size={16} /> 图文操作指南</div></header>
    <section className="guide-layout" aria-label="快速上手步骤">
      <nav className="guide-steps" aria-label="教程步骤"><div className="guide-steps-title">开始使用</div>{steps.map((item, index) => <button type="button" key={item.title} className={index === current ? "guide-step is-active" : "guide-step"} onClick={() => setCurrent(index)}><span className="guide-step-number">{index < current ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.kicker.replace(/^\d+ \/ /, "")}</small></span></button>)}<div className="guide-steps-note">不需要一次完成，随时可以回来查看。</div></nav>
      <article className="guide-content"><div className="guide-content-top"><div><span className="eyebrow">{step.kicker}</span><h2>{step.title}</h2><p>{step.summary}</p></div>{step.action && <Link className="button secondary" href={step.action.href}>{step.action.label}<ExternalLink size={14} /></Link>}</div>
        <div className="guide-visual"><div className="guide-image-frame"><img src={step.image} alt={step.imageAlt} />{step.annotations?.map((item) => <span className="guide-marker" style={{ top: item.top, left: item.left }} key={item.label}>{item.label}</span>)}</div><div className="guide-annotation-list">{step.annotations?.map((item) => <div className="guide-annotation" key={item.label}><b>{item.label}</b><span>{item.text}</span></div>)}</div></div>
        {step.gallery && <div className="guide-flow-gallery" aria-label="搜题流程示例">{step.gallery.map((item) => <figure key={item.src}><div><img src={item.src} alt={item.alt} /></div><figcaption>{item.label}</figcaption></figure>)}</div>}
        <div className="guide-notes"><h3>操作要点</h3><ul>{step.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
        {current === 3 && <section id="shortcut-keys" className="guide-shortcut-table" aria-label="重点快捷键"><div><h3>重点快捷键</h3><p>Mac 示例：⌘ 代表 Command，⇧ 代表 Shift。Windows 的组合键不同，请以桌面端当前设置为准。</p></div><dl><div><dt>截图（Mac）</dt><dd><kbd>⌘⇧H</kbd><span>先截取题目画面</span></dd></div><div><dt>单选题（Mac）</dt><dd><kbd>⌘⇧M</kbd><span>截图后再按此键搜题</span></dd></div><div><dt>多选题</dt><dd><span className="shortcut-value">以桌面端设置为准</span><span>截图后再按对应题型键</span></dd></div><div><dt>隐藏考试界面</dt><dd><span className="shortcut-value">以桌面端设置为准</span><span>快速隐藏或恢复窗口</span></dd></div><div><dt>退出考试界面</dt><dd><span className="shortcut-value">以桌面端设置为准</span><span>结束考试界面操作</span></dd></div></dl></section>}
        <footer className="guide-footer"><button type="button" className="button ghost" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}><ArrowLeft size={15} />上一步</button><span>{current + 1} / {steps.length}</span><div className="guide-footer-actions">{current === 0 && download && <a className="button secondary" href={download.href} target="_blank" rel="noreferrer"><Download size={15} />{download.label}</a>}<button type="button" className="button" onClick={() => setCurrent((value) => Math.min(steps.length - 1, value + 1))} disabled={current === steps.length - 1}>{current === steps.length - 1 ? "已完成" : "下一步"}<ArrowRight size={15} /></button></div></footer>
      </article>
    </section>
  </main>;
}
