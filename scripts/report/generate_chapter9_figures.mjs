import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("output/report/figures/chapter9");

const C = {
  ink: "#17233C",
  muted: "#52637A",
  line: "#9AA9BC",
  pale: "#F3F7FB",
  blue: "#155EEF",
  cyan: "#0891B2",
  green: "#079455",
  amber: "#D97706",
  red: "#D92D20",
  violet: "#7C3AED",
  white: "#FFFFFF",
};

const defs = `
  <defs>
    <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${C.blue}"/></marker>
    <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${C.green}"/></marker>
    <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${C.red}"/></marker>
    <marker id="arrow-gray" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${C.muted}"/></marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#102A43" flood-opacity="0.12"/></filter>
    <style>
      text{font-family:"Noto Sans Thai","TH Sarabun New",Arial,sans-serif;fill:${C.ink}}
      .title{font-size:34px;font-weight:700}.subtitle{font-size:17px;fill:${C.muted}}
      .section{font-size:18px;font-weight:700}.label{font-size:17px;font-weight:700}
      .body{font-size:15px}.small{font-size:13px;fill:${C.muted}}.tiny{font-size:11px;fill:${C.muted}}
      .box{fill:${C.white};stroke:${C.line};stroke-width:1.7}.soft{fill:${C.pale};stroke:${C.line};stroke-width:1.5}
      .cmd{fill:none;stroke:${C.blue};stroke-width:3;marker-end:url(#arrow-blue)}
      .feedback{fill:none;stroke:${C.green};stroke-width:3;stroke-dasharray:8 6;marker-end:url(#arrow-green)}
      .error{fill:none;stroke:${C.red};stroke-width:2.5;stroke-dasharray:7 5;marker-end:url(#arrow-red)}
      .signal{fill:none;stroke:${C.muted};stroke-width:2.4;marker-end:url(#arrow-gray)}
    </style>
  </defs>`;

function wrap(title, subtitle, body, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1350" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title><desc id="desc">${desc}</desc>${defs}
  <rect width="1600" height="900" fill="#FFFFFF"/>
  <rect x="34" y="30" width="1532" height="840" rx="18" fill="#FFFFFF" stroke="#C8D2E1" stroke-width="2"/>
  <text x="72" y="84" class="title">${title}</text>
  <text x="72" y="116" class="subtitle">${subtitle}</text>
  <line x1="72" y1="138" x2="1528" y2="138" stroke="#D8E1EC" stroke-width="2"/>
  ${body}
  </svg>`;
}

function box(x, y, w, h, title, lines = [], accent = C.blue, cls = "box") {
  const lineText = lines.map((line, i) => `<text x="${x + 20}" y="${y + 69 + i * 23}" class="body">${line}</text>`).join("");
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" class="${cls}"/><rect x="${x}" y="${y}" width="7" height="${h}" rx="4" fill="${accent}"/><text x="${x + 20}" y="${y + 35}" class="label">${title}</text>${lineText}</g>`;
}

function pill(x, y, w, text, fill, color = C.white) {
  return `<rect x="${x}" y="${y}" width="${w}" height="28" rx="14" fill="${fill}"/><text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-size="13" font-weight="700" style="fill:${color}">${text}</text>`;
}

function systemArchitecture() {
  const body = `
  <rect x="72" y="166" width="1456" height="164" rx="14" fill="#F7FAFE" stroke="#C8D2E1" stroke-width="1.5"/>
  <text x="94" y="194" class="section" fill="${C.blue}">ส่วนเว็บและบริการส่วนกลาง</text>
  ${box(94, 214, 208, 88, "ผู้ใช้ / ผู้ควบคุม", ["เว็บเบราว์เซอร์"], C.blue)}
  ${box(356, 214, 218, 88, "Next.js", ["Web application"], C.blue)}
  ${box(630, 200, 274, 116, "FastAPI Backend", ["งานขนส่ง · สิทธิ์ · API", "สถานะและเหตุการณ์แบบเรียลไทม์"], C.blue)}
  ${box(960, 214, 226, 88, "PostgreSQL", ["ข้อมูลระบบและประวัติ"], C.violet)}
  <path d="M302 258H346" class="cmd"/><path d="M574 258H620" class="cmd"/>
  <path d="M914 247H950" class="cmd"/><path d="M950 275H914" class="feedback"/>
  <text x="319" y="242" class="tiny">HTTPS</text><text x="583" y="242" class="tiny">REST / WS</text><text x="917" y="228" class="tiny">SQL</text>

  <rect x="72" y="358" width="1456" height="418" rx="14" fill="#FBFCFE" stroke="#8EA2BC" stroke-width="1.7" stroke-dasharray="10 7"/>
  <text x="94" y="388" class="section" fill="${C.green}">ส่วนหุ่นยนต์จริงภายในเครือข่ายปฏิบัติการ</text>
  ${box(118, 425, 230, 112, "Robot Agent", ["เชื่อมต่อออกไปยัง Backend", "ตรวจสอบและแปลงคำสั่ง"], C.green)}
  ${box(420, 425, 244, 112, "ROS 2 Jazzy", ["หัวข้อ · บริการ · Action", "TF และ diagnostics"], C.cyan)}
  ${box(736, 409, 244, 144, "Nav2 / AMCL / SLAM", ["วางแผนเส้นทาง", "ระบุตำแหน่งและสร้างแผนที่", "สร้างคำสั่งความเร็ว"], C.cyan)}
  ${box(1052, 425, 210, 112, "Base Driver", ["Kinematics · safety", "UART protocol"], C.amber)}
  ${box(1330, 425, 150, 112, "ESP32", ["PI + watchdog", "300 ms"], C.amber)}
  <path d="M348 481H410" class="cmd"/><path d="M664 481H726" class="cmd"/><path d="M980 481H1042" class="cmd"/><path d="M1262 481H1320" class="cmd"/>
  <path d="M630 316V346H233V415" class="cmd"/><path d="M258 425V372H654V316" class="feedback"/><text x="318" y="366" class="small">Authenticated outbound WSS</text>

  ${box(116, 628, 206, 104, "กล้อง USB", ["ภาพจากด้านหน้า"], C.green, "soft")}
  ${box(380, 628, 206, 104, "YDLidar X3", ["LaserScan"], C.green, "soft")}
  ${box(644, 628, 206, 104, "Encoder + IMU", ["รอบล้อ · การเคลื่อนที่"], C.green, "soft")}
  ${box(938, 628, 226, 104, "TB6612FNG", ["ขับมอเตอร์ซ้าย–ขวา"], C.amber, "soft")}
  ${box(1230, 628, 250, 104, "ฐานขับเคลื่อน", ["มอเตอร์ · ล้อ · โครงรถ"], C.amber, "soft")}
  <path d="M218 628V580H233V547" class="feedback"/><path d="M483 628V586H542V547" class="feedback"/><path d="M747 628V580H852V553" class="feedback"/>
  <path d="M1405 537V598H1051V618" class="cmd"/><path d="M1164 680H1220" class="cmd"/>
  <path d="M420 526H358V592H292" class="feedback"/>
  <text x="86" y="824" class="small">ข้อมูลย้อนกลับสู่เว็บ: ตำแหน่ง · เส้นทาง · สถานะภารกิจ · diagnostics · ภาพกล้อง</text>
  <g transform="translate(1120,816)"><line x1="0" y1="0" x2="48" y2="0" class="cmd"/><text x="60" y="5" class="small">คำสั่ง</text><line x1="150" y1="0" x2="198" y2="0" class="feedback"/><text x="210" y="5" class="small">ข้อมูลย้อนกลับ</text></g>`;
  return wrap(
    "สถาปัตยกรรมระบบหุ่นยนต์เคลื่อนที่อัตโนมัติควบคุมผ่านเว็บ",
    "แยกขอบเขตเว็บ บริการส่วนกลาง และส่วนควบคุมหุ่นยนต์ พร้อมทิศทางคำสั่งและข้อมูลย้อนกลับ",
    body,
    "Engineering architecture showing Browser, Next.js, FastAPI, PostgreSQL, Robot Agent, ROS 2, Nav2, base driver, ESP32, sensors and motors."
  );
}

function sensorLayout() {
  const body = `
  <rect x="72" y="166" width="972" height="632" rx="14" fill="#F8FAFC" stroke="#C8D2E1" stroke-width="1.5"/>
  <text x="96" y="198" class="section">มุมมองจากด้านบน (ไม่ใช่มาตราส่วน)</text>
  <path d="M180 242V194" class="cmd"/><text x="128" y="230" class="label" fill="${C.blue}">ด้านหน้า</text>
  <rect x="250" y="248" width="540" height="430" rx="12" fill="#EAF0F7" stroke="${C.ink}" stroke-width="4"/>
  <text x="520" y="700" text-anchor="middle" class="small">โครงอะลูมิเนียมประมาณ 36 × 30 ซม.</text>
  <rect x="206" y="340" width="54" height="126" rx="16" fill="#334155"/><rect x="780" y="340" width="54" height="126" rx="16" fill="#334155"/>
  <circle cx="250" cy="590" r="24" fill="#64748B"/><circle cx="790" cy="590" r="24" fill="#64748B"/>
  <text x="168" y="328" class="small">ล้อซ้าย + encoder</text><text x="776" y="328" class="small">ล้อขวา + encoder</text>
  <rect x="320" y="286" width="170" height="86" rx="10" fill="#FFFFFF" stroke="${C.blue}" stroke-width="2"/><text x="405" y="320" text-anchor="middle" class="label">ODROID-C4</text><text x="405" y="345" text-anchor="middle" class="small">ROS 2 / Nav2 / Robot Agent</text>
  <rect x="548" y="286" width="170" height="86" rx="10" fill="#FFFFFF" stroke="${C.amber}" stroke-width="2"/><text x="633" y="320" text-anchor="middle" class="label">ESP32</text><text x="633" y="345" text-anchor="middle" class="small">ควบคุมฐานขับเคลื่อน</text>
  <rect x="320" y="420" width="170" height="72" rx="10" fill="#FFF8EB" stroke="${C.amber}" stroke-width="2"/><text x="405" y="451" text-anchor="middle" class="label">TB6612FNG</text><text x="405" y="475" text-anchor="middle" class="small">Motor driver</text>
  <rect x="548" y="424" width="104" height="62" rx="10" fill="#ECFDF3" stroke="${C.green}" stroke-width="2"/><text x="600" y="451" text-anchor="middle" class="label">MPU6050</text><text x="600" y="474" text-anchor="middle" class="tiny">ใกล้กึ่งกลางตัวรถ</text>
  <circle cx="708" cy="562" r="52" fill="#FFF4E8" stroke="${C.amber}" stroke-width="3"/><circle cx="708" cy="562" r="17" fill="${C.amber}"/><text x="708" y="640" text-anchor="middle" class="label">เสาติดตั้ง YDLidar X3</text>
  <rect x="638" y="500" width="68" height="38" rx="8" fill="#E6F6FE" stroke="${C.cyan}" stroke-width="2"/><circle cx="656" cy="519" r="9" fill="${C.cyan}"/><text x="714" y="523" class="small">กล้อง USB หันไปด้านหน้า</text>
  <line x1="405" y1="372" x2="405" y2="410" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 5"/><line x1="633" y1="372" x2="633" y2="414" stroke="${C.line}" stroke-width="2" stroke-dasharray="6 5"/>

  <rect x="1070" y="166" width="458" height="632" rx="14" fill="#FFFFFF" stroke="#C8D2E1" stroke-width="1.5"/>
  <text x="1096" y="198" class="section">มุมมองด้านข้างและแกนอ้างอิง</text>
  <line x1="1110" y1="608" x2="1488" y2="608" stroke="${C.ink}" stroke-width="3"/><text x="1450" y="632" class="small">พื้น</text>
  <rect x="1134" y="510" width="296" height="72" rx="8" fill="#EAF0F7" stroke="${C.ink}" stroke-width="3"/>
  <circle cx="1190" cy="580" r="35" fill="#334155"/><circle cx="1376" cy="580" r="35" fill="#334155"/>
  <line x1="1352" y1="510" x2="1352" y2="300" stroke="#64748B" stroke-width="14"/>
  <circle cx="1352" cy="276" r="38" fill="#FFF4E8" stroke="${C.amber}" stroke-width="3"/><circle cx="1352" cy="276" r="12" fill="${C.amber}"/>
  <rect x="1312" y="330" width="80" height="42" rx="8" fill="#E6F6FE" stroke="${C.cyan}" stroke-width="2"/><circle cx="1332" cy="351" r="10" fill="${C.cyan}"/>
  <line x1="1430" y1="276" x2="1430" y2="608" stroke="${C.muted}" stroke-width="2" stroke-dasharray="7 5"/>
  <text x="1440" y="432" class="small">LiDAR สูงจากพื้น</text><text x="1440" y="454" class="label">ประมาณ 39.5 ซม.</text>
  <path d="M1210 468V390" class="cmd"/><text x="1198" y="372" class="small">แกน X: ด้านหน้า</text>
  <path d="M1210 468H1282" class="feedback"/><text x="1218" y="494" class="small">แกน Y: ด้านซ้าย</text>
  <circle cx="1210" cy="468" r="8" fill="${C.violet}"/><text x="1098" y="696" class="small">แกน Z ชี้ขึ้นจากพื้น</text>
  <rect x="1096" y="722" width="406" height="50" rx="10" fill="#FFF8EB" stroke="#F3C178"/><text x="1112" y="744" class="small">หมายเหตุ: ผังนี้ใช้อธิบายตำแหน่งเชิงหน้าที่ของต้นแบบ</text><text x="1112" y="764" class="small">ระยะกล้องและตำแหน่งเพลาควรวัดยืนยันก่อนทำแบบประกอบ</text>`;
  return wrap(
    "ตำแหน่งอุปกรณ์และเซนเซอร์บนหุ่นยนต์ต้นแบบ",
    "แสดงตำแหน่งเชิงหน้าที่ของคอมพิวเตอร์ควบคุม ชุดขับเคลื่อน LiDAR กล้อง IMU และ encoder",
    body,
    "Top and side engineering layout of the prototype robot with ODROID, ESP32, motor driver, encoders, IMU, LiDAR and camera."
  );
}

function motorLoop() {
  const body = `
  <text x="82" y="176" class="section" fill="${C.blue}">เส้นทางคำสั่งความเร็ว</text>
  ${box(82, 205, 188, 100, "Nav2 Controller", ["/cmd_vel_navigation"], C.blue)}
  ${box(320, 205, 218, 100, "Command Arbiter", ["เจ้าของคำสั่ง + stop"], C.blue)}
  ${box(588, 191, 234, 128, "Base Driver", ["Differential kinematics", "v, ω → RPM ซ้าย/ขวา"], C.blue)}
  ${box(884, 205, 178, 100, "UART2", ["115200 baud"], C.amber)}
  ${box(1112, 191, 218, 128, "ESP32", ["PI ซ้าย / PI ขวา", "watchdog 300 ms"], C.amber)}
  ${box(1380, 205, 142, 100, "TB6612", ["PWM / DIR"], C.amber)}
  <path d="M270 255H310" class="cmd"/><path d="M538 255H578" class="cmd"/><path d="M822 255H874" class="cmd"/><path d="M1062 255H1102" class="cmd"/><path d="M1330 255H1370" class="cmd"/>
  <text x="291" y="238" class="tiny">Twist</text><text x="826" y="238" class="tiny">RPM setpoint</text>

  ${box(1346, 406, 176, 112, "มอเตอร์ซ้าย–ขวา", ["แรงบิดและความเร็วล้อ"], C.amber, "soft")}
  ${box(1056, 618, 236, 108, "Quadrature Encoder", ["รอบและทิศทางล้อ"], C.green, "soft")}
  ${box(752, 618, 226, 108, "MPU6050", ["อัตราการหมุน / การเร่ง"], C.green, "soft")}
  ${box(434, 604, 248, 136, "robot_localization", ["รวม wheel odometry + IMU", "เผยแพร่ /odometry/filtered"], C.cyan)}
  ${box(114, 604, 244, 136, "Nav2 / AMCL", ["ใช้ odometry และ TF", "ปรับการวางแผนต่อเนื่อง"], C.cyan)}
  <path d="M1450 305V396" class="cmd"/><path d="M1434 518V574H1174V608" class="feedback"/>
  <path d="M1112 618V564H1221V329" class="feedback"/><text x="1234" y="563" class="small">Measured RPM</text>
  <path d="M978 672H1046" class="feedback"/><path d="M1056 690H692" class="feedback"/>
  <path d="M752 672H692" class="feedback"/><path d="M434 672H368" class="feedback"/>
  <path d="M235 604V560H176V315" class="feedback"/>

  <rect x="82" y="382" width="1118" height="150" rx="14" fill="#FFF8EB" stroke="#EAB46A" stroke-width="1.5"/>
  <text x="104" y="414" class="section" fill="${C.amber}">เงื่อนไขความปลอดภัยที่ตัดคำสั่งมอเตอร์</text>
  ${pill(104, 438, 194, "คำสั่งหมดอายุ", C.red)}${pill(318, 438, 216, "Stop / E-stop", C.red)}${pill(554, 438, 206, "ข้อมูลผิดรูปแบบ", C.red)}${pill(780, 438, 234, "Encoder stall / fault", C.red)}
  <text x="104" y="502" class="body">เมื่อพบเงื่อนไขผิดปกติ ESP32 กำหนด PWM = 0 และลดสัญญาณ STBY เพื่อหยุดเอาต์พุตของชุดขับมอเตอร์</text>
  <g transform="translate(1110,796)"><line x1="0" y1="0" x2="52" y2="0" class="cmd"/><text x="64" y="5" class="small">คำสั่งควบคุม</text><line x1="188" y1="0" x2="240" y2="0" class="feedback"/><text x="252" y="5" class="small">ข้อมูลย้อนกลับ</text></g>`;
  return wrap(
    "วงรอบควบคุมฐานขับเคลื่อนและข้อมูลย้อนกลับ",
    "แปลงคำสั่งความเร็วจาก Nav2 เป็นรอบล้อ ควบคุมด้วย PI และส่งผลวัดกลับเข้าสู่ระบบนำทาง",
    body,
    "Closed-loop drive control showing Nav2 velocity, command arbitration, base driver, UART, ESP32 PI loops, TB6612 motors, encoders, IMU and localization feedback."
  );
}

function navigationProcess() {
  const body = `
  <rect x="72" y="168" width="1456" height="214" rx="14" fill="#F7FAFE" stroke="#C8D2E1" stroke-width="1.5"/>
  <text x="94" y="198" class="section" fill="${C.cyan}">โหมดสร้างแผนที่ (Mapping)</text>
  ${box(96, 224, 184, 100, "YDLidar X3", ["/scan"], C.green)}
  ${box(330, 224, 194, 100, "Wheel odom + IMU", ["/odom · /imu"], C.green)}
  ${box(600, 210, 258, 128, "SLAM Toolbox", ["จับคู่ข้อมูลการเคลื่อนที่", "สร้าง Occupancy Grid"], C.cyan)}
  ${box(934, 224, 226, 100, "แผนที่ชั่วขณะ", ["/map"], C.violet)}
  ${box(1236, 224, 238, 100, "บันทึกแผนที่", ["PGM/PNG + YAML"], C.violet)}
  <path d="M280 258V202H566V248H590" class="cmd"/><path d="M524 292H590" class="cmd"/><path d="M858 274H924" class="cmd"/><path d="M1160 274H1226" class="cmd"/>

  <rect x="72" y="410" width="1456" height="356" rx="14" fill="#FBFCFE" stroke="#8EA2BC" stroke-width="1.5"/>
  <text x="94" y="440" class="section" fill="${C.blue}">โหมดปฏิบัติงาน (Localization + Navigation)</text>
  ${box(96, 474, 196, 104, "แผนที่ที่บันทึก", ["Map Server"], C.violet)}
  ${box(96, 624, 196, 104, "LiDAR + Odometry", ["scan · odom · TF"], C.green)}
  ${box(356, 520, 222, 128, "AMCL", ["ประมาณท่าทางของหุ่นยนต์", "map → odom"], C.cyan)}
  ${box(646, 462, 216, 104, "สถานีเป้าหมาย", ["PoseStamped"], C.blue)}
  ${box(646, 618, 216, 104, "Pose ปัจจุบัน", ["map → base_link"], C.cyan)}
  ${box(930, 502, 244, 146, "Nav2", ["Global planner + costmaps", "Controller + recoveries", "NavigateToPose action"], C.blue)}
  ${box(1242, 520, 238, 128, "ฐานขับเคลื่อน", ["/cmd_vel → ล้อ", "odometry ย้อนกลับ"], C.amber)}
  <path d="M292 526H346" class="cmd"/><path d="M292 676H330V602H346" class="feedback"/>
  <path d="M578 584H620V670H636" class="feedback"/><path d="M862 514H920" class="cmd"/><path d="M862 670H900V608H920" class="feedback"/>
  <path d="M1174 576H1232" class="cmd"/><path d="M1242 624H1204V700H578V626" class="feedback"/>
  <text x="1186" y="556" class="tiny">Twist</text><text x="908" y="690" class="tiny">pose / path / progress</text>
  <rect x="96" y="792" width="1384" height="46" rx="10" fill="#ECFDF3" stroke="#86D7B4"/>
  <text x="112" y="820" class="body">ผลลัพธ์ที่ส่งกลับเว็บ: แผนที่ ตำแหน่งปัจจุบัน เส้นทาง Nav2 ความคืบหน้าภารกิจ และสถานะการนำทาง</text>`;
  return wrap(
    "กระบวนการสร้างแผนที่ ระบุตำแหน่ง และนำทางอัตโนมัติ",
    "SLAM Toolbox ใช้สร้างแผนที่ ส่วน AMCL และ Nav2 ใช้แผนที่เดิมในการระบุตำแหน่งและเคลื่อนที่ไปยังสถานี",
    body,
    "Two-mode process diagram: SLAM mapping, then saved-map AMCL localization and Nav2 navigation with sensor and odometry feedback."
  );
}

function missionState() {
  const state = (x, y, w, h, code, thai, color = C.blue) => `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#FFFFFF" stroke="${color}" stroke-width="2.2"/><rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${color}"/><text x="${x + w / 2}" y="${y + 41}" text-anchor="middle" class="label">${code}</text><text x="${x + w / 2}" y="${y + 69}" text-anchor="middle" class="small">${thai}</text></g>`;
  const body = `
  ${state(80, 246, 170, 92, "QUEUED", "รอเริ่มงาน", C.muted)}
  ${state(280, 246, 210, 92, "GOING_TO_PICKUP", "กำลังไปยังจุดรับ", C.blue)}
  ${state(520, 246, 230, 92, "WAITING_FOR_LOADING", "รอยืนยันการรับสิ่งของ", C.amber)}
  ${state(780, 246, 180, 92, "DELIVERING", "กำลังไปยังปลายทาง", C.blue)}
  ${state(990, 246, 245, 92, "WAITING_FOR_RECEIVER", "รอยืนยันการส่งมอบ", C.violet)}
  ${state(1265, 246, 230, 92, "COMPLETED", "เสร็จสิ้น", C.green)}
  <path d="M250 292H270" class="cmd"/><path d="M490 292H510" class="cmd"/><path d="M750 292H770" class="cmd"/><path d="M960 292H980" class="cmd"/><path d="M1235 292H1255" class="cmd"/>

  <rect x="184" y="430" width="1232" height="124" rx="14" fill="#F7FAFE" stroke="#C8D2E1"/>
  <text x="210" y="461" class="section">เหตุการณ์ที่ทำให้เปลี่ยนสถานะ</text>
  ${pill(210, 480, 220, "ระบบมอบหมายงาน", C.blue)}${pill(454, 480, 236, "Nav2 ถึงสถานี", C.cyan)}${pill(714, 480, 310, "ผู้ใช้/ผู้ควบคุมยืนยันผ่านเว็บ", C.violet)}${pill(1048, 480, 340, "Backend บันทึกเหตุการณ์และแจ้งเตือน", C.green)}

  ${state(318, 666, 190, 92, "CANCELLED", "ยกเลิกก่อนเริ่มงาน", C.muted)}
  ${state(1012, 666, 190, 92, "FAILED", "ภารกิจไม่สำเร็จ", C.red)}
  <path d="M165 338V620H413V656" class="signal"/><text x="204" y="606" class="small">ผู้ใช้ยกเลิกได้เมื่อยังไม่เริ่ม</text>
  <path d="M385 338V390M870 338V390M1112 338V390" fill="none" stroke="${C.red}" stroke-width="2.5" stroke-dasharray="7 5"/>
  <path d="M385 390H1510V620H1107V656" class="error"/>
  <text x="860" y="414" text-anchor="middle" class="small" fill="${C.red}">navigation rejected · timeout · safety fault · การเชื่อมต่อขาดหาย</text>

  <rect x="92" y="796" width="1436" height="44" rx="9" fill="#FFF8EB" stroke="#EAB46A"/>
  <text x="108" y="823" class="body">ขอบเขตต้นแบบ: การยืนยันรับและส่งมอบทำผ่านเว็บ ส่วนจอบนตัวหุ่นยนต์และการยืนยันตัวตนของผู้รับเป็นแนวทางพัฒนาต่อ</text>`;
  return wrap(
    "แผนภาพสถานะภารกิจรับและส่งสิ่งของ",
    "แสดงสถานะหลักตั้งแต่สร้างงานจนเสร็จสิ้น รวมทางเลือกการยกเลิกและความล้มเหลวของภารกิจ",
    body,
    "Mission state machine from queued through pickup, loading confirmation, delivery and receiver confirmation, with cancelled and failed terminal states."
  );
}

const figures = [
  ["01_system_architecture", systemArchitecture()],
  ["02_robot_sensor_layout", sensorLayout()],
  ["03_motor_control_loop", motorLoop()],
  ["04_slam_amcl_nav2_process", navigationProcess()],
  ["05_mission_state_diagram", missionState()],
];

await mkdir(OUT, { recursive: true });
for (const [name, svg] of figures) {
  const svgPath = path.join(OUT, `${name}.svg`);
  const pngPath = path.join(OUT, `${name}.png`);
  await writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  console.log(`${svgPath}\n${pngPath}`);
}
