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
const BUILD = path.join(ROOT, "tmp/presentation_build");
const PREVIEWS = path.join(BUILD, "previews");
const OUT = path.join(ROOT, "output/presentation");
const FINAL = path.join(OUT, "indoor-delivery-robot-final-presentation.pptx");

const C = {
  navy: "#0A3B82",
  blue: "#1678BE",
  cyan: "#55BDD8",
  pale: "#F2F4FF",
  pale2: "#EAF7FB",
  ink: "#102A43",
  muted: "#55718F",
  white: "#FFFFFF",
  line: "#C7EAF3",
  green: "#20A878",
  orange: "#F0A43A",
  red: "#D95362",
};
const FONT = "Noto Sans Thai";
const W = 1280;
const H = 720;

const A = {
  arch: "/home/nattanns18/Downloads/robot-report-figures/chapter-09-final/figure-9-1-system-architecture.png",
  drive: "/home/nattanns18/Downloads/robot-report-figures/chapter-09-final/figure-9-2-differential-drive.png",
  control: "/home/nattanns18/Downloads/robot-report-figures/chapter-09-final/figure-9-3-pi-feedback-control.png",
  nav: "/home/nattanns18/Downloads/robot-report-figures/chapter-09-final/figure-9-4-mapping-localization-navigation.png",
  states: "/home/nattanns18/Downloads/robot-report-figures/chapter-09-final/figure-9-5-task-state-machine.png",
  sequence: path.join(ROOT, "output/report/figures/chapter10/figure-10.4-mission-execution-sequence-monochrome.png"),
  admin: path.join(ROOT, "output/report/figures/chapter11/selected/11.1a-admin-dashboard.png"),
  user: path.join(ROOT, "output/report/figures/chapter11/selected/11.1b-user-dashboard.png"),
  queued: path.join(ROOT, "output/report/figures/chapter11/selected/11.2a-task305-queued.png"),
  cancelled: path.join(ROOT, "output/report/figures/chapter11/selected/11.2c-task303-cancelled-history.png"),
  statuses: path.join(ROOT, "output/report/figures/chapter11/selected/11.3a-task-list-statuses.png"),
  event: path.join(ROOT, "output/report/figures/chapter11/selected/11.3b-task288-event-history.png"),
  slam: path.join(ROOT, "output/report/figures/chapter11/selected/11.4a-slam-mapping.png"),
  mapReview: path.join(ROOT, "output/report/figures/chapter11/selected/11.4b-map-review-map-test-01.png"),
  mapActive: path.join(ROOT, "output/report/figures/chapter11/selected/11.4c-map-test-01-active.png"),
  localization: path.join(ROOT, "output/report/figures/chapter11/selected/11.4d-localization-ready.png"),
  route: path.join(ROOT, "output/report/figures/chapter11/selected/11.5a-task288-route-c-to-d.png"),
  pickup: path.join(ROOT, "output/report/figures/chapter11/selected/11.5b-task288-arrived-pickup.png"),
  delivering: path.join(ROOT, "output/report/figures/chapter11/selected/11.5c-task288-delivering.png"),
  completed: path.join(ROOT, "output/report/figures/chapter11/selected/11.5d-task288-completed.png"),
  eventFull: path.join(ROOT, "output/report/figures/chapter11/selected/11.6-task288-event-history.png"),
};

function addRect(slide, x, y, w, h, fill, radius = 0, line = "none") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}
function addText(slide, text, x, y, w, h, size = 22, color = C.ink, bold = false, opts = {}) {
  const t = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  t.text = text;
  t.text.style = { fontFamily: FONT, fontSize: size, color, bold, ...(opts.style || {}) };
  if (opts.align) t.text.paragraphFormat = { alignment: opts.align };
  return t;
}
function addImage(slide, file, alt, x, y, w, h, fit = "contain", radius = 0) {
  return slide.images.add({
    blob: new Uint8Array(readFileSync(file)),
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
    ...(radius ? { geometry: "roundRect", borderRadius: radius } : {}),
  });
}
function base(slide, num, section, title, kicker = "") {
  slide.background.fill = C.white;
  addText(slide, section.toUpperCase(), 64, 36, 350, 20, 12, C.blue, true);
  addText(slide, String(num).padStart(2, "0"), 1160, 34, 56, 24, 14, C.blue, true, { align: "right" });
  addText(slide, title, 64, 72, 1080, 54, 34, C.navy, true);
  addRect(slide, 64, 137, 92, 5, C.cyan, 3);
  if (kicker) addText(slide, kicker, 174, 126, 990, 28, 15, C.muted, false);
  addText(slide, "Indoor Delivery Robot", 64, 688, 250, 18, 10, C.muted, false);
}
function pill(slide, text, x, y, w, fill = C.pale, color = C.navy) {
  addRect(slide, x, y, w, 38, fill, 19);
  addText(slide, text, x + 14, y + 7, w - 28, 24, 14, color, true, { align: "center" });
}
function labelBlock(slide, number, heading, detail, x, y, w, accent) {
  addText(slide, number, x, y + 6, 50, 30, 17, accent, true);
  addText(slide, heading, x + 62, y, w - 62, 34, 22, C.ink, true);
  addText(slide, detail, x + 62, y + 38, w - 62, 54, 15, C.muted, false);
}
function photoFrame(slide, x, y, w, h) {
  addRect(slide, x - 2, y - 2, w + 4, h + 4, C.white, 18, C.line);
}

const p = Presentation.create({ slideSize: { width: W, height: H } });

// 01 Cover
{
  const s = p.slides.add(); s.background.fill = C.white;
  addRect(s, 0, 0, 26, H, C.navy);
  addRect(s, 76, 102, 8, 88, C.cyan, 4);
  addText(s, "โครงงานสหกิจศึกษา", 104, 84, 420, 34, 16, C.blue, true);
  addText(s, "ระบบหุ่นยนต์เคลื่อนที่อัตโนมัติ\nสำหรับรับส่งสิ่งของภายในอาคารผ่านเว็บ", 104, 132, 850, 170, 43, C.navy, true);
  addText(s, "Web-Based Indoor Autonomous Delivery Robot Prototype", 108, 322, 760, 38, 19, C.muted, false);
  addRect(s, 104, 402, 410, 2, C.line);
  addText(s, "ณัฐนนท์ สีระศรี", 104, 432, 360, 34, 20, C.ink, true);
  addText(s, "วิศวกรรมคอมพิวเตอร์  •  นำเสนอ 7 นาที", 104, 473, 480, 30, 15, C.muted, false);
  addRect(s, 925, 80, 245, 245, C.pale, 122);
  addRect(s, 997, 152, 101, 101, C.pale2, 50);
  addRect(s, 1067, 414, 80, 80, C.cyan, 40);
  addRect(s, 914, 526, 208, 12, C.navy, 6);
  addText(s, "HARDWARE  ×  ROS 2  ×  WEB", 904, 562, 260, 28, 12, C.blue, true, { align: "center" });
}

// 02 Background
{
  const s = p.slides.add(); base(s, 2, "Project Overview", "ที่มาและความสำคัญ", "จากการเคลื่อนที่ สู่กระบวนการภารกิจที่ติดตามได้");
  addText(s, "ปัญหาไม่ได้อยู่ที่ “หุ่นยนต์เดินได้หรือไม่” เพียงอย่างเดียว", 64, 178, 720, 40, 25, C.ink, true);
  addText(s, "ระบบจริงต้องเชื่อมการควบคุมฐาน เซนเซอร์ แผนที่ ตำแหน่ง การนำทาง และสถานะภารกิจให้เป็นภาพเดียวสำหรับผู้ใช้งาน", 64, 230, 740, 72, 17, C.muted, false);
  addRect(s, 835, 176, 365, 122, C.navy, 22);
  addText(s, "NAVIGATION ≠ MISSION", 867, 201, 302, 35, 21, C.white, true, { align: "center" });
  addText(s, "การไปถึงจุดหมายยังไม่ครอบคลุมคิว\nการยืนยันรับ–ส่ง และประวัติ", 867, 244, 302, 48, 14, C.white, false, { align: "center" });
  addRect(s, 64, 348, 1136, 1, C.line);
  labelBlock(s, "01", "หลายระบบต้องทำงานร่วมกัน", "มอเตอร์ เซนเซอร์ SLAM ตำแหน่ง และการนำทาง", 88, 382, 510, C.blue);
  labelBlock(s, "02", "ผู้ใช้ต้องเห็นขั้นตอนของภารกิจ", "กำหนดต้นทาง–ปลายทาง ตรวจสอบคิว และติดตามสถานะ", 650, 382, 510, C.cyan);
  labelBlock(s, "03", "เว็บเป็นส่วนติดต่อกลาง", "Robot Agent เชื่อมคำสั่งและสถานะกับ ROS 2", 88, 510, 510, C.cyan);
  labelBlock(s, "04", "เรียนรู้จากระบบจริง", "พัฒนาต้นแบบและทดสอบบนฐานหุ่นยนต์จริงในพื้นที่ทดลอง", 650, 510, 510, C.blue);
}

// 03 Objectives & scope
{
  const s = p.slides.add(); base(s, 3, "Project Overview", "วัตถุประสงค์และขอบเขต", "กำหนดสิ่งที่พัฒนา และสิ่งที่ยังไม่กล่าวอ้าง");
  addRect(s, 64, 176, 534, 440, C.pale, 24);
  addText(s, "เป้าหมายของต้นแบบ", 96, 204, 450, 38, 25, C.navy, true);
  const goals = [
    ["01", "ฐาน Differential Drive พร้อมมอเตอร์และเซนเซอร์"],
    ["02", "SLAM Toolbox + AMCL + Nav2 บน ROS 2"],
    ["03", "เว็บจัดการภารกิจ คิว สถานะ และประวัติ"],
    ["04", "Robot Agent เชื่อมเว็บกับระบบหุ่นยนต์"],
    ["05", "ทดสอบฟังก์ชันและระบบร่วมกันบนหุ่นยนต์จริง"],
  ];
  goals.forEach((g, i) => { addText(s, g[0], 96, 264 + i*62, 40, 24, 14, C.blue, true); addText(s, g[1], 146, 258 + i*62, 405, 42, 16, C.ink, i===0); });
  addRect(s, 634, 176, 566, 250, C.navy, 24);
  addText(s, "ขอบเขตที่ทดสอบ", 670, 205, 490, 38, 24, C.white, true);
  addText(s, "หุ่นยนต์จริง 1 คัน  •  พื้นที่ทดลองภายในห้อง\nสร้างแผนที่และกำหนดสถานีบนแผนที่\nยืนยันการวาง–รับสิ่งของผ่านเว็บ", 670, 260, 478, 106, 17, C.white, false);
  addRect(s, 634, 450, 566, 166, C.pale2, 24);
  addText(s, "ข้อจำกัดของงานระยะนี้", 670, 478, 490, 34, 22, C.navy, true);
  addText(s, "ยังไม่มีโครงสร้างบรรทุกเฉพาะ และยังไม่ประเมิน\nความสามารถในการขนส่งสิ่งของจริงหรือความเสถียรระยะยาว", 670, 526, 474, 62, 16, C.muted, false);
}

// 04 Architecture
{
  const s = p.slides.add(); base(s, 4, "System Design", "สถาปัตยกรรมระบบ", "คำสั่งไหลลงสู่หุ่นยนต์ สถานะไหลกลับสู่ผู้ใช้งาน");
  photoFrame(s, 64, 170, 790, 472);
  addImage(s, A.arch, "แผนภาพสถาปัตยกรรมระบบหุ่นยนต์ เว็บ Robot Agent และ ROS 2", 78, 184, 762, 444, "contain", 12);
  addText(s, "3 ชั้นที่ทำงานร่วมกัน", 900, 184, 290, 32, 22, C.navy, true);
  pill(s, "WEB APPLICATION", 900, 238, 250, C.pale, C.navy);
  addText(s, "ผู้ใช้ • ภารกิจ • คิว • ประวัติ", 914, 282, 250, 40, 14, C.muted, false);
  pill(s, "ROBOT AGENT", 900, 350, 250, C.pale2, C.navy);
  addText(s, "แปลงคำสั่งและเผยแพร่สถานะ", 914, 394, 250, 40, 14, C.muted, false);
  pill(s, "ROS 2 + HARDWARE", 900, 462, 250, C.navy, C.white);
  addText(s, "SLAM • Localization • Nav2 • Base", 914, 506, 250, 40, 14, C.muted, false);
  addText(s, "Robot Agent คือจุดเชื่อมต่อหลัก\nไม่ให้เว็บผูกกับ ROS 2 โดยตรง", 900, 574, 274, 52, 15, C.ink, true);
}

// 05 motion
{
  const s = p.slides.add(); base(s, 5, "Robot Platform", "ฐานขับเคลื่อนและการควบคุม", "Differential Drive แปลงความเร็วเชิงเส้นและเชิงมุมเป็นคำสั่งล้อ");
  addRect(s, 64, 170, 550, 446, C.pale2, 24);
  addImage(s, A.drive, "แผนภาพหลักการขับเคลื่อน Differential Drive", 84, 190, 510, 406, "contain", 12);
  addRect(s, 650, 170, 550, 260, C.white, 20, C.line);
  addImage(s, A.control, "แผนภาพวงควบคุมความเร็วล้อแบบป้อนกลับ", 670, 188, 510, 224, "contain", 12);
  addText(s, "ลำดับการควบคุม", 672, 462, 280, 32, 23, C.navy, true);
  const chain = ["cmd_vel", "คำนวณ vL / vR", "ควบคุม PI", "PWM มอเตอร์", "Encoder feedback"];
  chain.forEach((t,i)=> { pill(s,t, 670 + (i%3)*168, 510 + Math.floor(i/3)*58, i===4?224:150, i===0?C.navy:C.pale, i===0?C.white:C.navy); });
  addText(s, "ใช้ผลตอบกลับจาก Encoder เพื่อลดความคลาดเคลื่อนของความเร็วล้อ", 672, 634, 500, 32, 14, C.muted, false);
}

// 06 nav
{
  const s = p.slides.add(); base(s, 6, "Navigation", "การสร้างแผนที่ ระบุตำแหน่ง และนำทาง", "โมดูลแต่ละตัวรับผิดชอบคนละช่วงของวงจรการเคลื่อนที่");
  addImage(s, A.nav, "แผนภาพการทำงานร่วมกันของ SLAM Toolbox AMCL และ Nav2", 64, 166, 760, 478, "contain", 14);
  addText(s, "SLAM TOOLBOX", 876, 184, 270, 28, 17, C.blue, true);
  addText(s, "สร้าง occupancy map จาก LaserScan และ Odometry", 876, 218, 300, 52, 15, C.muted, false);
  addRect(s, 876, 288, 292, 2, C.line);
  addText(s, "AMCL", 876, 316, 270, 28, 17, C.blue, true);
  addText(s, "ประมาณตำแหน่งของหุ่นยนต์บนแผนที่ที่เลือก", 876, 350, 300, 52, 15, C.muted, false);
  addRect(s, 876, 420, 292, 2, C.line);
  addText(s, "NAV2", 876, 448, 270, 28, 17, C.blue, true);
  addText(s, "รับเป้าหมาย วางแผนเส้นทาง และส่งคำสั่งความเร็ว", 876, 482, 300, 52, 15, C.muted, false);
  addRect(s, 876, 566, 292, 60, C.navy, 16);
  addText(s, "MAP → POSE → PATH → MOTION", 890, 583, 264, 28, 13, C.white, true, { align: "center" });
}

// 07 web and agent
{
  const s = p.slides.add(); base(s, 7, "System Integration", "เว็บแอปพลิเคชันและ Robot Agent", "แยกหน้าที่จัดการภารกิจออกจากระบบนำทาง แต่แลกเปลี่ยนสถานะต่อเนื่อง");
  addImage(s, A.sequence, "Sequence diagram การสร้างภารกิจและส่งเป้าหมายจากเว็บผ่าน Robot Agent ไปยัง Nav2", 64, 166, 738, 492, "contain", 12);
  addText(s, "บทบาทสำคัญ", 850, 180, 300, 32, 23, C.navy, true);
  labelBlock(s, "01", "เว็บจัดการ Workflow", "ผู้ใช้ สถานี คิว ภารกิจ และประวัติ", 850, 236, 326, C.blue);
  labelBlock(s, "02", "Agent แปลงคำสั่ง", "รับงานจาก API และเรียก Nav2 action", 850, 344, 326, C.cyan);
  labelBlock(s, "03", "สถานะส่งกลับ", "Pose, navigation state และเหตุการณ์ภารกิจ", 850, 452, 326, C.blue);
  addRect(s, 850, 568, 326, 74, C.pale2, 18);
  addText(s, "ผลลัพธ์: ผู้ใช้ติดตามงานได้\nโดยไม่ต้องสั่ง ROS 2 โดยตรง", 872, 584, 284, 46, 15, C.ink, true, { align: "center" });
}

// 08 task state
{
  const s = p.slides.add(); base(s, 8, "Mission Workflow", "วงจรสถานะของภารกิจ", "การเคลื่อนที่ถูกครอบด้วยขั้นตอนรับ–ส่งที่ตรวจสอบย้อนหลังได้");
  addImage(s, A.states, "แผนภาพสถานะภารกิจตั้งแต่เข้าคิวจนสำเร็จ ล้มเหลว หรือยกเลิก", 64, 164, 785, 492, "contain", 12);
  addText(s, "เส้นทางปกติ", 894, 180, 270, 30, 22, C.navy, true);
  ["QUEUED", "GOING TO PICKUP", "WAITING FOR LOADING", "DELIVERING", "COMPLETED"].forEach((t,i)=>pill(s,t, 894, 228+i*58, 270, i===4?C.navy:(i%2?C.pale2:C.pale), i===4?C.white:C.navy));
  addText(s, "เส้นทางผิดปกติ", 894, 532, 270, 28, 18, C.red, true);
  addText(s, "FAILED หรือ CANCELLED จะถูกบันทึกพร้อมเหตุการณ์และเวลา", 894, 568, 270, 58, 15, C.muted, false);
}

// 09 UI
{
  const s = p.slides.add(); base(s, 9, "Web Application", "มุมมองผู้ดูแลและผู้ใช้งาน", "ข้อมูลชุดเดียวกัน แต่แสดงตามบทบาทและงานที่ต้องตัดสินใจ");
  photoFrame(s, 64, 174, 550, 360); addImage(s, A.admin, "หน้าจอแดชบอร์ดผู้ดูแลระบบ แสดงแผนที่ กล้อง และสุขภาพระบบ", 64, 174, 550, 360, "cover", 16);
  photoFrame(s, 666, 174, 550, 360); addImage(s, A.user, "หน้าจอแดชบอร์ดผู้ใช้งาน แสดงงาน คิว และตำแหน่งหุ่นยนต์", 666, 174, 550, 360, "cover", 16);
  addText(s, "ADMIN", 64, 556, 150, 26, 16, C.blue, true);
  addText(s, "แผนที่สด • กล้อง • สุขภาพ topic • การควบคุมภารกิจ", 64, 586, 530, 44, 15, C.muted, false);
  addText(s, "USER", 666, 556, 150, 26, 16, C.blue, true);
  addText(s, "สถานะงาน • ตำแหน่งคิว • เวลารอ • ประวัติของตนเอง", 666, 586, 530, 44, 15, C.muted, false);
}

// 10 test design
{
  const s = p.slides.add(); base(s, 10, "Testing", "แนวทางการทดสอบและหลักฐาน", "แยกการตรวจเว็บ หุ่นยนต์ และการทำงานร่วมกันเพื่ออ่านผลได้ชัดเจน");
  const cols = [
    {x:64, n:"WT-01", t:"ฟังก์ชันเว็บ", d:"เข้าสู่ระบบ แดชบอร์ด แผนที่ และสิทธิ์ผู้ใช้", c:C.pale},
    {x:350, n:"WT-02", t:"วงจรภารกิจ", d:"สร้างงาน เข้าคิว ยกเลิก และบันทึก Event History", c:C.pale2},
    {x:636, n:"WT-03", t:"ประวัติและผลลัพธ์", d:"Completed / Failed / Cancelled และเวลาของแต่ละขั้น", c:C.pale},
    {x:922, n:"RT-01", t:"SLAM + Localization", d:"สร้าง Map-Test-01 เลือกแผนที่ และกำหนด Initial Pose", c:C.pale2},
  ];
  cols.forEach((q,i)=>{
    addRect(s,q.x,184,246,330,q.c,24);
    addText(s,q.n,q.x+24,210,198,28,16,i===3?C.cyan:C.blue,true);
    addText(s,q.t,q.x+24,264,198,58,23,C.navy,true);
    addText(s,q.d,q.x+24,340,198,98,15,C.muted,false);
    addText(s,["SCREENSHOT","EVENT LOG","TASK LIST","VIDEO + SCREEN"][i],q.x+24,460,198,24,11,C.blue,true);
  });
  addRect(s,64,544,1104,92,C.navy,20);
  addText(s,"หลักฐานที่ใช้",90,567,170,32,18,C.white,true);
  addText(s,"ภาพหน้าจอระบบจริง  •  Event History  •  วิดีโอการสร้างแผนที่ Map-Test-01",260,568,864,34,16,C.white,false);
  addText(s,"หมายเหตุ: ผลการทดสอบเป็นหลักฐานของกรณีที่บันทึกไว้ ไม่ใช่อัตราความสำเร็จรวมของระบบ",90,606,1030,24,12,C.line,false);
}

// 11 SLAM evidence
{
  const s = p.slides.add(); base(s, 11, "Test Results", "ผลการสร้างแผนที่และระบุตำแหน่ง", "RT-01: สร้าง Map-Test-01 และเตรียมแผนที่สำหรับการนำทาง");
  photoFrame(s,64,170,548,356); addImage(s,A.slam,"หน้าจอ Web mapping ระหว่าง SLAM พร้อมภาพกล้องสด",64,170,548,356,"cover",16);
  photoFrame(s,668,170,548,356); addImage(s,A.localization,"หน้าจอ Localization แสดงสถานะ Localized และ Initial pose accepted",668,170,548,356,"cover",16);
  addText(s,"01  สร้างแผนที่",64,550,230,28,17,C.blue,true);
  addText(s,"ควบคุมหุ่นยนต์ผ่านหน้าเว็บและรับ occupancy map จาก ROS /map",64,584,526,46,15,C.muted,false);
  addText(s,"02  ระบุตำแหน่ง",668,550,230,28,17,C.blue,true);
  addText(s,"เลือก Map-Test-01 กำหนด Initial Pose และระบบรายงาน Localized",668,584,526,46,15,C.muted,false);
}

// 12 Task evidence
{
  const s = p.slides.add(); base(s, 12, "Test Results", "ผลการจัดการคิวและสถานะภารกิจ", "WT-02 / WT-03: ระบบบันทึกทั้งงานที่ดำเนินต่อและงานที่ยกเลิก");
  photoFrame(s,64,170,548,340); addImage(s,A.statuses,"รายการภารกิจหลายสถานะ เช่น queued completed failed และ cancelled",64,170,548,340,"cover",16);
  photoFrame(s,668,170,548,340); addImage(s,A.cancelled,"Event History ของงาน TASK-303 ที่ถูกยกเลิกและส่งการยกเลิก Nav2",668,170,548,340,"cover",16);
  addText(s,"รายการงาน",64,536,220,28,18,C.navy,true);
  addText(s,"แสดง Queued / Waiting / Completed / Failed / Cancelled ในหน้ารวม",64,570,526,52,15,C.muted,false);
  addText(s,"Event History",668,536,220,28,18,C.navy,true);
  addText(s,"บันทึกผู้ก่อเหตุ เวลา การเปลี่ยนสถานะ และผลตอบกลับจาก Robot Agent",668,570,526,52,15,C.muted,false);
}

// 13 integrated case
{
  const s = p.slides.add(); base(s, 13, "Integrated Test", "กรณีทดสอบระบบร่วมกัน: TASK-288", "หลักฐานหนึ่งรอบจาก C → D ครบตั้งแต่รับงานจนยืนยันรับสิ่งของ");
  photoFrame(s,64,166,650,424); addImage(s,A.route,"หน้าจอภารกิจ TASK-288 แสดงเส้นทางจากสถานี C ไป D บนแผนที่",64,166,650,424,"cover",16);
  addText(s,"TASK-288",760,182,300,38,26,C.navy,true);
  pill(s,"C  →  D",760,232,160,C.navy,C.white);
  const events = [
    ["11:13:10", "Task created / assigned"],
    ["11:14:14", "Arrived pickup — Nav2 succeeded"],
    ["11:14:31", "Confirm loaded — Delivering"],
    ["11:15:58", "Arrived destination"],
    ["11:16:04", "Confirm received — Completed"],
  ];
  events.forEach((e,i)=>{
    addRect(s,770,294+i*58,14,14,i===4?C.green:C.cyan,7);
    if(i<4)addRect(s,776,308+i*58,2,44,C.line);
    addText(s,e[0],802,286+i*58,88,24,12,C.blue,true);
    addText(s,e[1],900,284+i*58,288,32,14,C.ink,i===4);
  });
  addText(s,"ผลที่ยืนยันได้",64,614,180,26,16,C.blue,true);
  addText(s,"ระบบบันทึกลำดับเหตุการณ์ครบสำหรับกรณีนี้ แต่ยังไม่ใช้สรุปความน่าเชื่อถือโดยรวม",244,612,900,30,14,C.muted,false);
}

// 14 conclusion
{
  const s = p.slides.add(); base(s, 14, "Conclusion", "สรุปผล ข้อจำกัด และงานต่อไป", "ต้นแบบเชื่อมฮาร์ดแวร์ ROS 2 และเว็บเป็นกระบวนการเดียวกันได้");
  addRect(s,64,174,680,150,C.navy,24);
  addText(s,"ผลที่ได้",96,202,190,32,22,C.white,true);
  addText(s,"ฐานหุ่นยนต์เคลื่อนที่จริง  •  SLAM / Localization / Nav2\nเว็บจัดการภารกิจและประวัติ  •  Robot Agent เชื่อมคำสั่งและสถานะ",96,250,604,60,16,C.white,false);
  addText(s,"ข้อจำกัด",64,366,220,34,24,C.navy,true);
  addText(s,"•  หุ่นยนต์ต้นแบบ 1 คันในพื้นที่ทดลอง\n•  ยังไม่มีโครงสร้างบรรทุกสิ่งของเฉพาะ\n•  หลักฐานการนำทางสำเร็จที่สรุปมี 1 กรณี\n•  ยังไม่ประเมินความเสถียรและประสิทธิภาพระยะยาว",80,414,548,150,16,C.muted,false);
  addRect(s,782,174,418,390,C.pale2,24);
  addText(s,"งานพัฒนาต่อ",818,204,340,34,24,C.navy,true);
  const next = ["เพิ่มโครงสร้างบรรทุกและกลไกยืนยันสิ่งของ","เก็บผลทดสอบซ้ำหลายเส้นทางและหลายสภาพแวดล้อม","ปรับปรุงความปลอดภัยและการกู้คืนเมื่อการนำทางล้มเหลว","ประเมินเวลาภารกิจ ความแม่นยำ และความพร้อมใช้งาน"];
  next.forEach((t,i)=>{ addText(s,String(i+1).padStart(2,"0"),818,270+i*66,38,24,13,C.blue,true); addText(s,t,864,264+i*66,292,50,15,C.ink,i===0); });
  addText(s,"ขอบคุณครับ",782,600,418,42,28,C.navy,true,{align:"center"});
}

await fs.rm(BUILD, { recursive: true, force: true });
await fs.mkdir(PREVIEWS, { recursive: true });
await fs.mkdir(OUT, { recursive: true });
for (const [i, slide] of p.slides.items.entries()) {
  const png = await p.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(PREVIEWS, `slide-${String(i+1).padStart(2,"0")}.png`), new Uint8Array(await png.arrayBuffer()));
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
  explicitTotalSlideCount: 14,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "indoor-delivery-robot-final-presentation.pptx.validation.json"),
});
console.log(JSON.stringify({ final: FINAL, previews: PREVIEWS, result }, null, 2));
