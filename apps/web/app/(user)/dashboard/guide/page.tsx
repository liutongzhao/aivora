"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Check, Image as ImageIcon } from "lucide-react";
import { getDesktopDownload, getDesktopPlatform } from "../../../../lib/desktop-download";

type Annotation = { label: string; text: string; top: string; left: string };
type GuideStep = { title: string; kicker: string; summary: string; image: string; imageAlt: string; annotations?: Annotation[]; notes: string[]; action?: { href: string; label: string } };

const steps: GuideStep[] = [
  { title: "下载桌面端", kicker: "01 / 准备工作", summary: "Web 端负责账号和配置，桌面端负责截图、快捷键和搜题。先安装与你的系统匹配的客户端。", image: "/guide/web-dashboard.png", imageAlt: "Aivora Web 工作台界面", annotations: [{ label: "A", text: "这里可以查看任务、额度和模型配置状态。", top: "22%", left: "68%" }], notes: ["macOS 用户下载 .dmg，Windows 用户下载 .exe。", "安装完成后，使用与 Web 端相同的账号登录桌面端。"], action: { href: "https://download.aivora.cuzisme.cn/Aivora-latest.dmg", label: "下载桌面端" } },
  { title: "配置模型", kicker: "02 / 必做设置", summary: "模型是搜题时负责识别图片和生成答案的服务。你可以直接使用管理员配置的内置模型，也可以添加自己的模型。", image: "/guide/desktop-models.png", imageAlt: "桌面端模型配置页面", annotations: [{ label: "A", text: "内置模型：直接选择使用，显示剩余次数，不可编辑。", top: "25%", left: "20%" }, { label: "B", text: "添加模型：填写地址和密钥后选择模型保存。", top: "31%", left: "89%" }, { label: "C", text: "每个模型都可以先测试，测试不会扣内置模型次数。", top: "51%", left: "79%" }], notes: ["自定义模型需要支持图片识别，否则无法完成截图搜题。", "添加模型不会自动改变题型分配，下一步需要选择题型默认模型。"], action: { href: "/dashboard/settings", label: "打开模型设置" } },
  { title: "分配题型模型", kicker: "03 / 推荐设置", summary: "模型列表和题型分配是两件事。添加模型后，在题型分配中选择每类题目实际使用的模型。", image: "/guide/desktop-routing.png", imageAlt: "桌面端题型分配页面", annotations: [{ label: "A", text: "先切换到题型分配标签。", top: "15%", left: "41%" }, { label: "B", text: "为编程题、选择题等分别选择默认模型。", top: "45%", left: "67%" }], notes: ["没有内置模型时，需要先添加自己的模型，再为题型分配。", "不同题型可以使用不同模型，按你的模型能力和速度选择即可。"], action: { href: "/dashboard/settings", label: "查看题型分配" } },
  { title: "设置快捷键", kicker: "04 / 提升效率", summary: "快捷键是桌面端最常用的操作入口。建议先测试一次，确认不会和其他软件的快捷键冲突。", image: "/guide/desktop-shortcuts.png", imageAlt: "桌面端快捷键设置页面", annotations: [{ label: "A", text: "按题型标签切换不同的快捷键配置。", top: "18%", left: "29%" }, { label: "B", text: "在这里测试快捷键是否生效。", top: "36%", left: "74%" }], notes: ["截图搜题快捷键建议设置成容易按到、又不容易误触的组合。", "修改后可以立即在测试区域验证。"] },
  { title: "第一次搜题", kicker: "05 / 开始使用", summary: "配置完成后，打开题目页面，使用截图快捷键即可开始。答案会在桌面端窗口中显示。", image: "/guide/web-dashboard.png", imageAlt: "Aivora 工作台和任务状态", annotations: [{ label: "A", text: "任务完成后，可以在 Web 端查看历史记录。", top: "65%", left: "76%" }], notes: ["尽量完整截取题目和选项，识别结果会更稳定。", "首次使用建议先用一道简单题测试截图范围和快捷键。"] },
  { title: "提示词按需配置", kicker: "06 / 可选设置", summary: "提示词不是必填项。不配置时直接使用系统默认提示词；有特殊答题格式或语言要求时，再按题型补充。", image: "/guide/desktop-models.png", imageAlt: "桌面端模型与提示词入口", annotations: [{ label: "A", text: "在提示词标签中按题型维护自己的要求。", top: "14%", left: "57%" }], notes: ["建议先使用默认提示词，确认流程正常后再调整。", "提示词影响回答格式和侧重点，不会改变模型连接。"], action: { href: "/dashboard/settings", label: "打开提示词设置" } },
];

export default function GuidePage() {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const platform = typeof navigator === "undefined" ? "unknown" : getDesktopPlatform(navigator.userAgent);
  const download = getDesktopDownload(platform);
  return <main className="container guide-page">
    <header className="guide-heading"><div><span className="eyebrow">QUICK START</span><h1>快速上手</h1><p>跟着 6 个步骤完成配置，第一次使用也能快速开始搜题。</p></div><div className="guide-heading-meta"><ImageIcon size={16} /> 图文操作指南</div></header>
    <section className="guide-layout" aria-label="快速上手步骤">
      <nav className="guide-steps" aria-label="教程步骤"><div className="guide-steps-title">开始使用</div>{steps.map((item, index) => <button type="button" key={item.title} className={index === current ? "guide-step is-active" : "guide-step"} onClick={() => setCurrent(index)}><span className="guide-step-number">{index < current ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.kicker.replace(/^\d+ \/ /, "")}</small></span></button>)}<div className="guide-steps-note">不需要一次完成，随时可以回来查看。</div></nav>
      <article className="guide-content"><div className="guide-content-top"><div><span className="eyebrow">{step.kicker}</span><h2>{step.title}</h2><p>{step.summary}</p></div>{step.action && <Link className="button secondary" href={step.action.href}>{step.action.label}<ExternalLink size={14} /></Link>}</div>
        <div className="guide-visual"><div className="guide-image-frame"><img src={step.image} alt={step.imageAlt} />{step.annotations?.map((item) => <span className="guide-marker" style={{ top: item.top, left: item.left }} key={item.label}>{item.label}</span>)}</div><div className="guide-annotation-list">{step.annotations?.map((item) => <div className="guide-annotation" key={item.label}><b>{item.label}</b><span>{item.text}</span></div>)}</div></div>
        <div className="guide-notes"><h3>操作要点</h3><ul>{step.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
        <footer className="guide-footer"><button type="button" className="button ghost" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}><ArrowLeft size={15} />上一步</button><span>{current + 1} / {steps.length}</span>{current === 0 && download ? <a className="button" href={download.href} target="_blank" rel="noreferrer"><Download size={15} />{download.label}</a> : <button type="button" className="button" onClick={() => setCurrent((value) => Math.min(steps.length - 1, value + 1))} disabled={current === steps.length - 1}>{current === steps.length - 1 ? "已完成" : "下一步"}<ArrowRight size={15} /></button>}</footer>
      </article>
    </section>
  </main>;
}
