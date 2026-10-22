import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Presentation, PresentationFile } = require("@oai/artifact-tool");

const ROOT = "/home/nattanns18/indoor-delivery-robot";
const SKILL_DIR = "/home/nattanns18/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const PYTHON = "/home/nattanns18/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const BUILD = path.join(ROOT, "tmp/presentation_build_v2");
const PREVIEWS = path.join(BUILD, "previews");
const OUT = path.join(ROOT, "output/presentation");
const FINAL = path.join(OUT, "indoor-delivery-robot-presentation-v8.pptx");

const W = 1280;
const H = 720;
const FONT = "Noto Sans Thai";
const C = {
  navy: "#0A3B82", blue: "#1678BE", cyan: "#55BDD8", ink: "#102A43",
  muted: "#58718B", pale: "#F2F4FF", ice: "#EAF7FB", line: "#C7EAF3",
  white: "#FFFFFF", green: "#159B72", red: "#D95362", orange: "#E89A2E",
};

const CH9 = path.join(ROOT, "output/report/figures/chapter9");
const CH11 = path.join(ROOT, "output/report/figures/chapter11_ready");
const A = {
  arch: path.join(CH9, "figure-9.1-system-architecture-monochrome.png"),
  drive: path.join(CH9, "figure-9.2-differential-drive-kinematics-monochrome.png"),
  control: path.join(CH9, "figure-9.3-closed-loop-wheel-speed-control-monochrome.png"),
  nav: path.join(CH9, "figure-9.4-mapping-localization-navigation-monochrome.png"),
  states: path.join(CH9, "figure-9.5-mission-state-machine-monochrome.png"),
  admin: path.join(CH11, "figure_11.1_user_interfaces/11.1a_admin_dashboard.png"),
  user: path.join(CH11, "figure_11.1_user_interfaces/11.1b_user_dashboard.png"),
  queued: path.join(CH11, "figure_11.2_create_cancel_task/11.2a_task305_queued.png"),
  statuses: path.join(CH11, "figure_11.3_task_status_history/11.3a_task_list_statuses.png"),
  event: path.join(CH11, "figure_11.3_task_status_history/11.3b_task288_event_history.png"),
  slam: path.join(CH11, "figure_11.4_slam_localization/11.4a_slam_mapping.png"),
  localization: path.join(CH11, "figure_11.4_slam_localization/11.4d_localization_ready.png"),
  route: path.join(CH11, "figure_11.5_task288_case_study/11.5a_task288_route.png"),
  completed: path.join(CH11, "figure_11.5_task288_case_study/11.5d_task288_completed.png"),
};

function rect(slide, x, y, w, h, fill, radius = 0, stroke = "none", strokeWidth = 0) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: strokeWidth },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, x, y, w, h, size = 20, color = C.ink, bold = false, align = "left") {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = value;
  box.text.style = { fontFamily: FONT, fontSize: size, color, bold };
  box.text.paragraphFormat = { alignment: align };
  return box;
}

function image(slide, file, alt, x, y, w, h, fit = "contain") {
  return slide.images.add({
    blob: new Uint8Array(readFileSync(file)),
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
  });
}

function header(slide, num, section, title, subtitle = "") {
  slide.background.fill = C.white;
  text(slide, section.toUpperCase(), 50, 22, 310, 20, 11, C.blue, true);
  text(slide, String(num).padStart(2, "0"), 1170, 21, 58, 22, 12, C.blue, true, "right");
  text(slide, title, 50, 58, 1150, 56, 33, C.navy, true);
  rect(slide, 50, 130, 94, 5, C.cyan, 3);
  if (subtitle) text(slide, subtitle, 172, 118, 1020, 30, 15, C.muted);
}

function lineText(slide, n, heading, detail, x, y, w, accent = C.blue) {
  text(slide, n, x, y + 4, 42, 26, 15, accent, true);
  text(slide, heading, x + 54, y, w - 54, 30, 20, C.ink, true);
  text(slide, detail, x + 54, y + 34, w - 54, 45, 14, C.muted);
}

function arrow(slide, x1, y1, x2, y2, color = C.cyan, width = 4) {
  const reverseX = x2 < x1;
  const reverseY = y2 < y1;
  slide.shapes.add({
    geometry: "line",
    position: {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    },
    line: {
      style: "solid",
      fill: color,
      width,
      ...(reverseX || reverseY ? { startArrowType: "triangle" } : { endArrowType: "triangle" }),
    },
  });
}

const p = Presentation.create({ slideSize: { width: W, height: H } });

// 01 Cover
{
  const s = p.slides.add();
  s.background.fill = C.white;
  rect(s, 0, 0, 22, H, C.navy);
  text(s, "โครงงานเตรียมสหกิจศึกษา", 82, 86, 600, 28, 15, C.blue, true);
  text(s, "ระบบหุ่นยนต์เคลื่อนที่อัตโนมัติ\nสำหรับรับส่งสิ่งของภายในอาคารผ่านเว็บ", 82, 142, 920, 140, 40, C.navy, true);
  rect(s, 82, 316, 95, 6, C.cyan, 3);
  text(s, "WEB-BASED INDOOR AUTONOMOUS DELIVERY ROBOT PROTOTYPE", 82, 344, 850, 34, 17, C.muted, false);
  text(s, "ณัฐนนท์ สีระศรี", 82, 468, 450, 32, 21, C.ink, true);
  text(s, "6610110087   วิศวกรรมคอมพิวเตอร์", 82, 510, 520, 28, 15, C.muted);
  text(s, "นำเสนอ 7 นาที", 82, 568, 250, 28, 14, C.blue, true);
  rect(s, 1000, 110, 150, 150, C.pale, 75);
  rect(s, 1042, 152, 66, 66, C.ice, 33);
  rect(s, 1088, 410, 70, 70, C.cyan, 35);
  rect(s, 958, 528, 218, 10, C.navy, 5);
}

// 02 Background and origin
{
  const s = p.slides.add(); header(s, 2, "Project Overview", "ที่มาและความสำคัญ", "แนวคิดเริ่มจากงานรับส่งภายในอาคารที่ต้องทำซ้ำ และต้องติดตามได้");
  text(s, "เราต้องการให้หุ่นยนต์รับงานจากผู้ใช้ แล้วเดินทางระหว่างสถานีได้ด้วยตนเอง", 50, 174, 1110, 44, 25, C.ink, true);
  text(s, "แทนที่ผู้ใช้งานจะต้องเดินไปส่งสิ่งของทุกครั้ง หรือต้องเปิดเครื่องมือ ROS เพื่อสั่งหุ่นยนต์โดยตรง", 50, 226, 1110, 36, 17, C.muted);
  rect(s, 50, 296, 520, 202, C.pale, 22);
  text(s, "ก่อนมีระบบนี้", 82, 326, 440, 30, 20, C.navy, true);
  text(s, "ผู้ใช้ต้องกำหนดคำสั่งด้วยเครื่องมือของหุ่นยนต์\nไม่เห็นคิวงานและสถานะของภารกิจในที่เดียว\nตรวจสอบย้อนหลังได้ยากเมื่อภารกิจล้มเหลว", 82, 374, 440, 90, 16, C.muted);
  rect(s, 614, 296, 616, 202, C.navy, 22);
  text(s, "แนวคิดของโครงงาน", 650, 326, 530, 30, 20, C.white, true);
  text(s, "สร้างฐานหุ่นยนต์ที่รับภารกิจจากเว็บ\nเดินทางไปยังสถานีรับของและสถานีปลายทาง\nส่งสถานะกลับให้ผู้ใช้ติดตามได้ตลอดกระบวนการ", 650, 374, 530, 90, 16, C.white);
  rect(s, 50, 540, 1180, 2, C.line);
  text(s, "ผลที่ต้องการ", 50, 572, 170, 26, 15, C.blue, true);
  text(s, "ผู้ใช้สร้างภารกิจ ติดตามสถานะ และดูประวัติได้จากเว็บ โดยไม่ต้องสั่ง ROS 2 โดยตรง", 220, 568, 1010, 34, 18, C.ink, true);
}

// 03 Project concept
{
  const s = p.slides.add(); header(s, 3, "Project Overview", "แนวคิดการทำงานของต้นแบบ", "หนึ่งภารกิจเชื่อมผู้ใช้งาน เว็บ ระบบนำทาง และหุ่นยนต์เข้าด้วยกัน");
  const steps = [
    ["01", "CREATE", "ผู้ใช้เลือกสถานีรับของและปลายทาง"],
    ["02", "ASSIGN", "เว็บส่งภารกิจผ่าน Robot Agent"],
    ["03", "NAVIGATE", "ROS 2 และ Nav2 พาหุ่นยนต์เคลื่อนที่"],
    ["04", "TRACK", "สถานะและเหตุการณ์ส่งกลับสู่หน้าเว็บ"],
  ];
  steps.forEach((q, i) => {
    const x = 50 + i * 298;
    rect(s, x, 208, 252, 252, i === 2 ? C.navy : (i % 2 ? C.ice : C.pale), 24);
    text(s, q[0], x + 24, 230, 54, 24, 14, i === 2 ? C.cyan : C.blue, true);
    text(s, q[1], x + 24, 282, 204, 32, 20, i === 2 ? C.white : C.navy, true);
    text(s, q[2], x + 24, 340, 204, 78, 15, i === 2 ? C.white : C.muted);
    if (i < 3) arrow(s, x + 256, 334, x + 290, 334, C.cyan, 3);
  });
  text(s, "ต้นแบบนี้มุ่งพิสูจน์การทำงานร่วมกันของทั้งระบบ มากกว่าการทดสอบการบรรทุกสิ่งของจริง", 50, 522, 1180, 34, 18, C.ink, true, "center");
  text(s, "การวางและรับสิ่งของยังยืนยันผ่านเว็บ และฐานหุ่นยนต์ยังไม่มีโครงสร้างบรรทุกเฉพาะ", 50, 568, 1180, 30, 15, C.muted, false, "center");
}

// 04 Objectives
{
  const s = p.slides.add(); header(s, 4, "Project Overview", "วัตถุประสงค์", "สิ่งที่โครงงานตั้งใจออกแบบ พัฒนา และทดสอบ");
  const items = [
    ["01", "พัฒนาฐานหุ่นยนต์ Differential Drive", "ใช้มอเตอร์ ชุดควบคุม และเซนเซอร์สำหรับตรวจวัดการเคลื่อนที่"],
    ["02", "พัฒนาระบบนำทางด้วย ROS 2", "ใช้ SLAM Toolbox, AMCL และ Nav2 สำหรับพื้นที่ทดลองภายในอาคาร"],
    ["03", "พัฒนาเว็บแอปพลิเคชัน", "สร้างภารกิจ จัดการคิว ติดตามสถานะ และดูประวัติตามสิทธิ์ผู้ใช้"],
    ["04", "พัฒนา Robot Agent", "รับส่งคำสั่ง ตำแหน่ง และสถานะระหว่างเว็บกับระบบหุ่นยนต์"],
    ["05", "ทดสอบการทำงานร่วมกัน", "ตรวจฟังก์ชันเว็บ การเคลื่อนที่จริง และลำดับการรับส่งสิ่งของจำลอง"],
  ];
  items.forEach((q, i) => lineText(s, q[0], q[1], q[2], i < 3 ? 70 : 660, 185 + (i < 3 ? i : i - 3) * 128, 530, i % 2 ? C.cyan : C.blue));
  rect(s, 620, 174, 2, 390, C.line);
}

// 05 Scope
{
  const s = p.slides.add(); header(s, 5, "Project Overview", "ขอบเขตของโครงงาน", "แยกสิ่งที่ทดสอบในต้นแบบออกจากสิ่งที่ยังไม่ได้นำมาประเมิน");
  rect(s, 50, 174, 565, 418, C.navy, 24);
  text(s, "ครอบคลุม", 84, 206, 470, 34, 23, C.white, true);
  const inScope = [
    "หุ่นยนต์จริง 1 คันในพื้นที่ทดลองภายในห้อง",
    "สถานีบนแผนที่ประมาณ 2 ถึง 4 จุด",
    "การสร้างแผนที่ ระบุตำแหน่ง และนำทาง",
    "เว็บจัดการผู้ใช้ สถานี ภารกิจ คิว และประวัติ",
    "ยืนยันการวางและรับสิ่งของผ่านเว็บ",
  ];
  inScope.forEach((v, i) => { text(s, String(i + 1).padStart(2, "0"), 84, 274 + i * 58, 40, 24, 13, C.cyan, true); text(s, v, 136, 268 + i * 58, 426, 34, 15, C.white); });
  rect(s, 665, 174, 565, 418, C.pale, 24);
  text(s, "ยังไม่ครอบคลุม", 699, 206, 470, 34, 23, C.navy, true);
  const outScope = [
    "โครงสร้างบรรทุกสิ่งของโดยเฉพาะ",
    "การประเมินน้ำหนักบรรทุกและการขนส่งจริง",
    "ระบบตรวจจับว่าสิ่งของถูกวางหรือรับแล้ว",
    "การรับรองความปลอดภัยสำหรับพื้นที่ทั่วไป",
    "ความเสถียรและประสิทธิภาพระยะยาว",
  ];
  outScope.forEach((v, i) => { text(s, String(i + 1).padStart(2, "0"), 699, 274 + i * 58, 40, 24, 13, C.blue, true); text(s, v, 751, 268 + i * 58, 426, 34, 15, C.ink); });
}

// 06 System architecture
{
  const s = p.slides.add(); header(s, 6, "System Design", "สถาปัตยกรรมระบบ", "สามส่วนหลักแลกเปลี่ยนคำสั่งและสถานะผ่าน Robot Agent");
  image(s, A.arch, "สถาปัตยกรรมล่าสุดของระบบเว็บ ODROID-C4 Robot Agent ROS 2 และฮาร์ดแวร์หุ่นยนต์", 62, 158, 1156, 490, "contain");
  text(s, "เว็บไม่เชื่อมต่อ ROS 2 โดยตรง  Robot Agent เป็นตัวกลางระหว่างระบบจัดการภารกิจกับหุ่นยนต์", 74, 646, 1132, 28, 14, C.muted, false, "center");
}

// 07 Differential drive
{
  const s = p.slides.add(); header(s, 7, "Robot Platform", "ฐานหุ่นยนต์และ Differential Drive", "ควบคุมทิศทางจากความเร็วล้อซ้ายและขวา");
  image(s, A.drive, "แผนภาพ Differential Drive ล่าสุด แสดงความเร็วล้อและการหมุนของฐานหุ่นยนต์", 50, 166, 770, 474, "contain");
  text(s, "ฮาร์ดแวร์หลัก", 866, 188, 320, 30, 22, C.navy, true);
  const hw = ["ODROID-C4 ประมวลผล ROS 2", "ESP32 ควบคุมฐานและอ่าน Encoder", "TB6612FNG ขับมอเตอร์ TT", "MPU6050 วัดการเคลื่อนที่", "YDLIDAR X3 สแกนพื้นที่", "USB Camera ส่งภาพสด"];
  hw.forEach((v, i) => { text(s, String(i + 1).padStart(2, "0"), 866, 242 + i * 58, 38, 22, 12, i % 2 ? C.cyan : C.blue, true); text(s, v, 914, 237 + i * 58, 292, 32, 14, C.ink); });
}

// 08 Real robot platform photo placeholder
{
  const s = p.slides.add(); header(s, 8, "Robot Platform", "ฐานหุ่นยนต์ต้นแบบจริง", "ฮาร์ดแวร์ที่ใช้ทดสอบการสร้างแผนที่ ระบุตำแหน่ง และนำทางภายในพื้นที่ทดลอง");

  rect(s, 50, 174, 770, 416, "#F7FAFC", 24, C.line, 2);
  rect(s, 84, 208, 702, 300, C.pale, 18, "#B8DDE8", 1);
  text(s, "รูปหุ่นยนต์จริง", 84, 316, 702, 34, 24, C.navy, true, "center");
  text(s, "วางรูปมุมเฉียงด้านหน้า ให้เห็นฐาน ล้อ และอุปกรณ์โดยรวม", 144, 362, 582, 30, 14, C.muted, false, "center");
  rect(s, 334, 412, 202, 42, C.white, 18, C.cyan, 1);
  text(s, "แทนที่ด้วยรูปถ่าย", 350, 422, 170, 24, 13, C.blue, true, "center");
  text(s, "ภาพฐานหุ่นยนต์ที่ใช้ในการทดลองจริง", 84, 532, 702, 28, 14, C.muted, false, "center");

  text(s, "องค์ประกอบหลัก", 866, 186, 320, 32, 22, C.navy, true);
  const realRobot = [
    ["01", "Differential Drive", "ฐานล้อซ้าย–ขวาสำหรับควบคุมทิศทาง"],
    ["02", "ODROID-C4", "ประมวลผล ROS 2 และระบบนำทาง"],
    ["03", "ESP32 และ Encoder", "ควบคุมมอเตอร์และอ่านการหมุนของล้อ"],
    ["04", "LiDAR, IMU และ Camera", "รับข้อมูลพื้นที่ การเคลื่อนที่ และภาพสด"],
  ];
  realRobot.forEach((q, i) => lineText(s, q[0], q[1], q[2], 866, 246 + i * 84, 340, i % 2 ? C.cyan : C.blue));
  rect(s, 866, 590, 340, 62, C.ice, 18);
  text(s, "ต้นแบบมุ่งทดสอบการเคลื่อนที่และระบบนำทาง\nยังไม่มีโครงสร้างบรรทุกสิ่งของโดยเฉพาะ", 884, 603, 304, 40, 12, C.ink, true, "center");
}

// 09 Mapping localization navigation
{
  const s = p.slides.add(); header(s, 9, "Navigation", "Mapping, Localization and Navigation", "สร้างแผนที่ก่อน ระบุตำแหน่งบนแผนที่ แล้วจึงส่งเป้าหมายให้ Nav2");
  image(s, A.nav, "แผนภาพล่าสุดแสดงขั้นตอน Mapping ด้วย SLAM Toolbox Localization ด้วย AMCL และ Navigation ด้วย Nav2", 42, 160, 1196, 500, "contain");
}

// 10 Web and Robot Agent as three connected systems
{
  const s = p.slides.add(); header(s, 10, "System Integration", "เว็บแอปพลิเคชันและ Robot Agent", "Robot Agent เชื่อมระบบจัดการภารกิจกับระบบนำทางของหุ่นยนต์");

  rect(s, 50, 190, 350, 372, C.ice, 24);
  text(s, "WEB SYSTEM", 82, 216, 286, 30, 20, C.navy, true);
  text(s, "ผู้ใช้งาน", 82, 276, 120, 26, 15, C.blue, true);
  text(s, "เลือกสถานี สร้างภารกิจ และยืนยันการรับส่ง", 82, 308, 270, 44, 14, C.ink);
  rect(s, 82, 374, 286, 1, C.line);
  text(s, "Web Application", 82, 400, 190, 26, 16, C.navy, true);
  text(s, "แสดงคิว สถานะ ตำแหน่ง และประวัติ", 82, 432, 270, 40, 14, C.muted);
  text(s, "Backend + Database", 82, 492, 190, 26, 16, C.navy, true);
  text(s, "ตรวจสอบและบันทึกภารกิจ", 82, 524, 270, 30, 14, C.muted);

  rect(s, 490, 174, 300, 404, C.navy, 26);
  text(s, "ROBOT AGENT", 522, 210, 236, 32, 22, C.white, true, "center");
  text(s, "ตัวกลางระหว่างเว็บกับ ROS 2", 522, 252, 236, 30, 14, C.line, false, "center");
  const agentSteps = [
    ["01", "รับภารกิจจาก Backend"],
    ["02", "เรียก Nav2 action"],
    ["03", "ติดตามผลการนำทาง"],
    ["04", "ส่งสถานะกลับสู่เว็บ"],
  ];
  agentSteps.forEach((q, i) => {
    text(s, q[0], 526, 316 + i * 54, 38, 22, 12, C.cyan, true);
    text(s, q[1], 574, 311 + i * 54, 178, 32, 14, C.white, i === 0);
  });

  rect(s, 880, 190, 350, 372, C.pale, 24);
  text(s, "ROBOT SYSTEM", 912, 216, 286, 30, 20, C.navy, true);
  text(s, "ROS 2 + Nav2", 912, 276, 180, 26, 16, C.navy, true);
  text(s, "รับเป้าหมาย วางแผนเส้นทาง และส่ง cmd_vel", 912, 308, 270, 44, 14, C.ink);
  rect(s, 912, 374, 286, 1, C.line);
  text(s, "Base Driver + ESP32", 912, 400, 210, 26, 16, C.navy, true);
  text(s, "ขับมอเตอร์และอ่าน Encoder", 912, 432, 270, 40, 14, C.muted);
  text(s, "Telemetry", 912, 492, 150, 26, 16, C.navy, true);
  text(s, "ส่ง Odometry ตำแหน่ง และสถานะกลับ", 912, 524, 270, 30, 14, C.muted);

  text(s, "MISSION COMMAND", 398, 220, 100, 22, 10, C.blue, true, "center");
  s.shapes.add({ geometry: "rightArrow", position: { left: 402, top: 270, width: 88, height: 24 }, fill: C.cyan, line: { style: "solid", fill: C.cyan, width: 0 } });
  text(s, "NAV2 GOAL", 786, 220, 100, 22, 10, C.blue, true, "center");
  s.shapes.add({ geometry: "rightArrow", position: { left: 790, top: 270, width: 88, height: 24 }, fill: C.cyan, line: { style: "solid", fill: C.cyan, width: 0 } });
  text(s, "STATUS + EVENT", 398, 494, 100, 22, 10, C.blue, true, "center");
  s.shapes.add({ geometry: "leftArrow", position: { left: 402, top: 452, width: 88, height: 24 }, fill: C.blue, line: { style: "solid", fill: C.blue, width: 0 } });
  text(s, "POSE + RESULT", 786, 494, 100, 22, 10, C.blue, true, "center");
  s.shapes.add({ geometry: "leftArrow", position: { left: 790, top: 452, width: 88, height: 24 }, fill: C.blue, line: { style: "solid", fill: C.blue, width: 0 } });

  text(s, "ผู้ใช้สั่งงานและติดตามภารกิจจากเว็บ โดยไม่ต้องติดต่อ ROS 2 โดยตรง", 50, 606, 1180, 30, 16, C.ink, true, "center");
}

// 11 Mission flow
{
  const s = p.slides.add(); header(s, 11, "Mission Flow", "ลำดับการทำงานของภารกิจ", "หนึ่งภารกิจประกอบด้วยการเดินทาง และการยืนยันรับ–ส่งผ่านหน้าเว็บ");
  text(s, "ลำดับปกติ", 50, 174, 160, 26, 15, C.blue, true);
  text(s, "ชื่อภาษาไทยอธิบายสิ่งที่ผู้ใช้เห็น ส่วนรหัสด้านล่างคือสถานะที่ระบบบันทึก", 176, 172, 900, 28, 13, C.muted);
  const stages = [
    ["01", "เข้าคิว", "QUEUED"],
    ["02", "ไปยังจุดรับ", "GOING_TO_PICKUP"],
    ["03", "รอยืนยันการวาง", "WAITING_FOR_LOADING"],
    ["04", "ไปยังปลายทาง", "DELIVERING"],
    ["05", "รอยืนยันการรับ", "WAITING_FOR_UNLOADING"],
    ["06", "เสร็จสิ้น", "COMPLETED"],
  ];
  stages.forEach((q, i) => {
    const x = 45 + i * 204;
    const fill = i === stages.length - 1 ? C.navy : (i % 2 ? C.ice : C.pale);
    const main = i === stages.length - 1 ? C.white : C.navy;
    rect(s, x, 222, 174, 154, fill, 22);
    text(s, q[0], x + 18, 240, 36, 22, 12, i === stages.length - 1 ? C.cyan : C.blue, true);
    text(s, q[1], x + 18, 278, 140, 46, 16, main, true);
    text(s, q[2], x + 18, 336, 140, 24, 7, i === stages.length - 1 ? C.white : C.muted, true);
    if (i < stages.length - 1) {
      s.shapes.add({ geometry: "rightArrow", position: { left: x + 177, top: 286, width: 24, height: 20 }, fill: C.cyan, line: { style: "solid", fill: C.cyan, width: 0 } });
    }
  });

  text(s, "กรณีสิ้นสุดอื่น", 50, 426, 200, 26, 15, C.red, true);
  rect(s, 50, 466, 360, 104, "#FFF2F4", 20);
  text(s, "ยกเลิก", 76, 488, 110, 26, 18, C.red, true);
  text(s, "CANCELLED", 76, 526, 110, 22, 10, C.red, true);
  text(s, "ผู้ใช้หรือผู้ดูแลยกเลิกภารกิจก่อนเริ่มเดินทาง", 190, 488, 190, 52, 13, C.ink);
  rect(s, 434, 466, 360, 104, "#FFF2F4", 20);
  text(s, "ล้มเหลว", 460, 488, 110, 26, 18, C.red, true);
  text(s, "FAILED", 460, 526, 110, 22, 10, C.red, true);
  text(s, "ระบบนำทางไม่สำเร็จ หรือไม่สามารถรับเป้าหมายได้", 574, 488, 190, 52, 13, C.ink);
  rect(s, 822, 448, 406, 140, C.ice, 22);
  text(s, "ขอบเขตของต้นแบบ", 850, 474, 340, 28, 16, C.navy, true);
  text(s, "การวางและรับสิ่งของยืนยันผ่านเว็บ\nเนื่องจากยังไม่มีเซนเซอร์ตรวจสิ่งของ", 850, 516, 340, 52, 13, C.ink);
  text(s, "ทุกสถานะถูกบันทึกเป็น Event History เพื่อให้ผู้ใช้ตรวจสอบย้อนหลังได้", 50, 620, 1178, 28, 14, C.muted, false, "center");
}

// 12 Testing plan
{
  const s = p.slides.add(); header(s, 12, "Testing", "การทดสอบแบ่งเป็น 3 ส่วน", "แต่ละส่วนตรวจคนละระดับ ก่อนนำผลมาพิจารณาร่วมกัน");
  const tests = [
    ["WEB APPLICATION TEST", "ตรวจสิทธิ์ผู้ใช้ หน้าจอภารกิจ คิว สถานะ และ Event History", "ผลลัพธ์แสดงในหน้า 13 และ 14"],
    ["ROBOT TEST", "ตรวจการสร้างแผนที่ การเลือกแผนที่ และ Localization", "ผลลัพธ์แสดงในหน้า 15"],
    ["INTEGRATION TEST", "ตรวจการส่งภารกิจผ่าน Robot Agent และการส่งสถานะกลับ", "ผลลัพธ์แสดงในหน้า 16"],
  ];
  tests.forEach((q, i) => {
    const x = 50 + i * 398;
    rect(s, x, 206, 350, 326, i === 1 ? C.ice : C.pale, 24);
    text(s, String(i + 1).padStart(2, "0"), x + 28, 232, 54, 24, 14, i === 1 ? C.cyan : C.blue, true);
    text(s, q[0], x + 28, 284, 294, 48, 20, C.navy, true);
    text(s, "ทดสอบอะไร", x + 28, 358, 120, 24, 13, C.blue, true);
    text(s, q[1], x + 28, 392, 294, 72, 14, C.ink);
    text(s, q[2], x + 28, 486, 294, 28, 12, C.muted, true);
  });
  text(s, "ผลทดสอบต่อไปนี้ยืนยันเฉพาะกรณีที่บันทึกไว้ ไม่ใช้แทนอัตราความสำเร็จรวมของระบบ", 50, 584, 1180, 30, 14, C.muted, false, "center");
}

// 13 Web application roles and dashboards
{
  const s = p.slides.add(); header(s, 13, "Web Application Test", "Web Application Test: สิทธิ์และหน้าจอผู้ใช้", "ตรวจว่าผู้ดูแลระบบและผู้ใช้งานทั่วไปเห็นข้อมูลตามบทบาทที่กำหนด");
  text(s, "สิ่งที่ทดสอบ", 50, 168, 130, 24, 13, C.blue, true);
  text(s, "เข้าสู่ระบบด้วยบัญชีต่างบทบาท แล้วตรวจเมนู แดชบอร์ด แผนที่ และข้อมูลภารกิจที่แต่ละบทบาทเข้าถึงได้", 180, 164, 1040, 32, 15, C.ink);
  image(s, A.admin, "แดชบอร์ดผู้ดูแลระบบ แสดงสถานะระบบ แผนที่ กล้อง และข้อมูลภารกิจ", 50, 224, 560, 340, "cover");
  image(s, A.user, "แดชบอร์ดผู้ใช้งาน แสดงสถานะภารกิจและข้อมูลที่เกี่ยวข้องกับผู้ใช้", 670, 224, 560, 340, "cover");
  text(s, "ADMIN DASHBOARD", 50, 584, 240, 24, 15, C.blue, true);
  text(s, "ผู้ดูแลตรวจสถานะระบบและจัดการข้อมูลส่วนกลาง", 50, 614, 548, 30, 14, C.muted);
  text(s, "USER DASHBOARD", 670, 584, 240, 24, 15, C.blue, true);
  text(s, "ผู้ใช้ติดตามภารกิจและข้อมูลของตนเอง", 670, 614, 548, 30, 14, C.muted);
}

// 14 Web application queue, status, and history
{
  const s = p.slides.add(); header(s, 14, "Web Application Test", "Web Application Test: คิว สถานะ และประวัติ", "ตรวจการบันทึกสถานะของภารกิจตั้งแต่สร้างงานจนสิ้นสุด");
  text(s, "สิ่งที่ทดสอบ", 50, 168, 130, 24, 13, C.blue, true);
  text(s, "สร้างภารกิจ ตรวจลำดับคิว และเปิด Event History เพื่อดูเวลา ผู้ก่อเหตุ และการเปลี่ยนสถานะของแต่ละขั้น", 180, 164, 1040, 32, 15, C.ink);
  image(s, A.statuses, "รายการภารกิจแสดงสถานะ Queued Waiting Completed Failed และ Cancelled", 50, 224, 560, 340, "cover");
  image(s, A.event, "Event History ของ TASK-288 แสดงลำดับเหตุการณ์และเวลาของแต่ละขั้น", 670, 224, 560, 340, "cover");
  text(s, "TASK LIST", 50, 584, 240, 24, 15, C.blue, true);
  text(s, "หน้ารวมแสดงคิว เส้นทาง เจ้าของงาน และสถานะล่าสุด", 50, 614, 548, 30, 14, C.muted);
  text(s, "EVENT HISTORY", 670, 584, 240, 24, 15, C.blue, true);
  text(s, "ประวัติบันทึกเวลา แหล่งที่มา และการเปลี่ยนสถานะ", 670, 614, 548, 30, 14, C.muted);
}

// 15 Robot test: SLAM and localization evidence
{
  const s = p.slides.add(); header(s, 15, "Robot Test", "Robot Test: SLAM and Localization", "ตรวจการสร้าง Map-Test-01 และการกำหนด Initial Pose บนหุ่นยนต์จริง");
  text(s, "สิ่งที่ทดสอบ", 50, 158, 130, 24, 13, C.blue, true);
  text(s, "ควบคุมฐานระหว่างสร้างแผนที่ บันทึกแผนที่ แล้วเลือกแผนที่เพื่อกำหนดตำแหน่งเริ่มต้นด้วย AMCL", 180, 154, 1040, 32, 15, C.ink);
  image(s, A.slam, "หน้าจอล่าสุดของการทำ Web Mapping และ Live SLAM map", 50, 210, 560, 354, "cover");
  image(s, A.localization, "หน้าจอล่าสุดแสดง Localization health เป็น Localized และ Initial pose accepted", 670, 210, 560, 354, "cover");
  text(s, "WEB MAPPING", 50, 584, 240, 24, 15, C.blue, true);
  text(s, "หน้าเว็บรับ occupancy map จาก ROS 2 ระหว่างควบคุมฐาน", 50, 614, 548, 30, 14, C.muted);
  text(s, "LOCALIZATION READY", 670, 584, 280, 24, 15, C.blue, true);
  text(s, "ระบบยอมรับ Initial Pose และรายงานสถานะ Localized", 670, 614, 548, 30, 14, C.muted);
}

// 16 Integration test TASK-288
{
  const s = p.slides.add(); header(s, 16, "Integration Test", "Integration Test: TASK-288 จากสถานี C ไปสถานี D", "ตรวจการส่งภารกิจจากเว็บไปยัง Robot Agent และการส่งสถานะกลับ");
  text(s, "สิ่งที่ทดสอบ", 50, 154, 130, 24, 13, C.blue, true);
  text(s, "สร้างภารกิจผ่านเว็บ ให้หุ่นยนต์เดินทางไปจุดรับและปลายทาง แล้วตรวจลำดับเหตุการณ์ที่ระบบบันทึก", 180, 150, 1040, 32, 15, C.ink);
  image(s, A.route, "หน้าจอล่าสุดของ TASK-288 แสดงเส้นทางจากสถานี C ไปสถานี D", 50, 204, 638, 372, "cover");
  text(s, "EVENT TIMELINE", 738, 204, 420, 28, 16, C.blue, true);
  const events = [
    ["23:13:10", "Task created and assigned"],
    ["23:14:14", "Arrived pickup"],
    ["23:14:31", "Confirm loaded"],
    ["23:15:58", "Arrived destination"],
    ["23:16:04", "Confirm received and completed"],
  ];
  events.forEach((q, i) => {
    rect(s, 742, 254 + i * 58, 14, 14, i === 4 ? C.green : C.cyan, 7);
    if (i < 4) rect(s, 748, 268 + i * 58, 2, 44, C.line);
    text(s, q[0], 778, 246 + i * 58, 90, 24, 12, C.blue, true);
    text(s, q[1], 880, 244 + i * 58, 330, 32, 14, C.ink, i === 4);
  });
  rect(s, 738, 554, 472, 56, C.navy, 18);
  text(s, "TOTAL ELAPSED  2 min 53 sec", 760, 568, 428, 26, 16, C.white, true, "center");
  text(s, "ผลนี้ยืนยันเฉพาะกรณี TASK-288 ไม่ใช่อัตราความสำเร็จรวม", 50, 604, 638, 28, 13, C.muted, false, "center");
}

// 17 Project summary
{
  const s = p.slides.add(); header(s, 17, "Conclusion", "สรุปผลการดำเนินโครงงาน", "ต้นแบบเชื่อมระบบนำทางของหุ่นยนต์กับการจัดการภารกิจผ่านเว็บเป็นกระบวนการเดียวกัน");
  rect(s, 50, 178, 560, 300, C.navy, 24);
  text(s, "ระบบที่พัฒนา", 82, 208, 490, 32, 22, C.white, true);
  text(s, "• ฐานหุ่นยนต์ Differential Drive ใช้ ODROID-C4 และ ESP32\n\n• ROS 2 ทำงานร่วมกับ SLAM Toolbox, AMCL และ Nav2\n\n• เว็บพัฒนาด้วย Next.js, FastAPI และ PostgreSQL\n\n• Robot Agent เชื่อมคำสั่งและสถานะระหว่างเว็บกับหุ่นยนต์", 82, 260, 486, 192, 15, C.white);

  rect(s, 638, 178, 592, 300, C.ice, 24);
  text(s, "ผลการทดสอบเบื้องต้น", 670, 208, 520, 32, 22, C.navy, true);
  text(s, "• สร้างภารกิจ จัดคิว และติดตามสถานะจากเว็บได้\n\n• สร้างแผนที่และกำหนดตำแหน่งเริ่มต้นในพื้นที่ทดลองได้\n\n• TASK-288 บันทึกลำดับเหตุการณ์ตั้งแต่รับงานจนเสร็จสิ้น", 670, 260, 514, 176, 15, C.ink);

  rect(s, 50, 506, 1180, 136, C.pale, 22);
  text(s, "ข้อจำกัด", 82, 532, 150, 28, 18, C.red, true);
  text(s, "• ยังไม่มีโครงสร้างบรรทุกสิ่งของโดยเฉพาะ", 250, 526, 300, 48, 14, C.ink);
  text(s, "• การวางและรับสิ่งของยังยืนยันผ่านเว็บ", 564, 526, 300, 48, 14, C.ink);
  text(s, "• ผลทดสอบยืนยันเฉพาะกรณีที่บันทึกไว้\n  ยังไม่ใช่ผลความเสถียรระยะยาว", 878, 526, 320, 66, 14, C.ink);
  text(s, "จึงสรุปได้ว่าระบบต้นแบบทำงานร่วมกันได้ตามขอบเขตที่กำหนด แต่ยังต้องพัฒนาก่อนนำไปใช้งานจริง", 82, 602, 1116, 24, 13, C.muted, true, "center");
}

// 18 Cooperative work direction
{
  const s = p.slides.add(); header(s, 18, "Conclusion", "12.2 แนวทางการดำเนินโครงงานในสถานประกอบการ", "นำประสบการณ์จากต้นแบบไปต่อยอดกับงานซอฟต์แวร์และระบบสมองกลฝังตัว");
  rect(s, 50, 176, 400, 400, C.ice, 24);
  text(s, "สถานประกอบการ", 82, 210, 320, 30, 18, C.blue, true);
  text(s, "APITechSmart Lab\nบริษัท เอ.พี.ไอ.เทค จำกัด", 82, 254, 320, 70, 22, C.navy, true);
  text(s, "ตำแหน่ง", 82, 358, 150, 24, 14, C.muted, true);
  text(s, "Programmer", 82, 392, 250, 32, 20, C.ink, true);
  text(s, "ลักษณะธุรกิจ", 82, 454, 150, 24, 14, C.muted, true);
  text(s, "เทคโนโลยีอิเล็กทรอนิกส์ยานยนต์\nระบบควบคุมและการวิเคราะห์ข้อมูลยานยนต์", 82, 486, 320, 60, 14, C.ink);
  text(s, "แนวทางที่คาดว่าจะเกี่ยวข้อง", 500, 188, 650, 32, 22, C.navy, true);
  const future = [
    ["01", "Automotive and IoT software", "พัฒนาโปรแกรมที่สื่อสารกับอุปกรณ์อิเล็กทรอนิกส์"],
    ["02", "Sensor data processing", "รับ ประมวลผล และแสดงข้อมูลจากเซนเซอร์"],
    ["03", "Monitoring and control applications", "สร้างแอปพลิเคชันเพื่อสนับสนุนการตรวจสอบหรือควบคุมอุปกรณ์"],
  ];
  future.forEach((q, i) => lineText(s, q[0], q[1], q[2], 500, 250 + i * 104, 690, i === 1 ? C.cyan : C.blue));
  rect(s, 500, 558, 690, 70, C.navy, 20);
  text(s, "สถานะปัจจุบัน", 526, 576, 150, 24, 14, C.cyan, true);
  text(s, "ยังไม่ได้รับหัวข้อโครงงานอย่างเป็นทางการ และจะกำหนดร่วมกับพนักงานที่ปรึกษา", 680, 572, 482, 36, 14, C.white, true);
  text(s, "ขอบคุณครับ", 50, 642, 1140, 34, 24, C.navy, true, "center");
}

await fs.rm(BUILD, { recursive: true, force: true });
await fs.mkdir(PREVIEWS, { recursive: true });
await fs.mkdir(OUT, { recursive: true });

for (const [i, slide] of p.slides.items.entries()) {
  const png = await p.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(PREVIEWS, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}

const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const stagingDir = path.join(BUILD, ".codex-finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const result = await finalizePresentation({
  workspaceDir: ROOT,
  candidatePath,
  finalPath: FINAL,
  pythonExecutable: PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  explicitTotalSlideCount: 18,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "indoor-delivery-robot-presentation-v8.pptx.validation.json"),
});

console.log(JSON.stringify({ final: FINAL, previews: PREVIEWS, result }, null, 2));
