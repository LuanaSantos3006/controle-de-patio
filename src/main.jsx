import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CarFront,
  Clock3,
  Container,
  MapPin,
  QrCode,
  Search,
  Truck,
  Users,
  X,
  LogOut,
  ChevronRight,
  CircleCheck,
  AlertTriangle,
  Maximize2,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, db, firebaseReady } from "./firebase";
import "./styles.css";

const initialDrivers = [
  {
    plate: "FZD6D39",
    name: "Walleson Matias",
    carrier: "Transportes Alpha",
    place: "Doca 03",
    status: "Em operação",
    since: "08:42",
    minutes: 38,
  },
  {
    plate: "CUA0I23",
    name: "Bruno Aladim",
    carrier: "Rota Sul",
    place: "Estacionamento B",
    status: "Aguardando",
    since: "08:15",
    minutes: 65,
  },
  {
    plate: "ELU8I19",
    name: "Gabriel Silveira",
    carrier: "Log Express",
    place: "Doca 01",
    status: "Em operação",
    since: "09:03",
    minutes: 17,
  },
  {
    plate: "EWU1F20",
    name: "Edivaldo Silva",
    carrier: "Via Cargo",
    place: "Estacionamento A",
    status: "Aguardando",
    since: "09:11",
    minutes: 9,
  },
];

const docks = [
  { id: "52", bases: ["IPR"] },
  { id: "53", bases: ["GOS", "SVM"] },
  { id: "54", bases: ["MAU"] },
  { id: "55", bases: ["GLS", "GUA"] },
  { id: "56", bases: ["MRP", "ATB"] },
  { id: "57", bases: ["JDP", "JTT", "JSS"] },
  { id: "58", bases: ["SBD", "AGFI"], blocked: true },
  { id: "59-A", bases: ["GTS", "MBI"] },
  { id: "59-B", bases: ["LBD"] },
  { id: "60", bases: ["LBD"] },
  { id: "61", bases: ["VLM", "VLM"] },
  { id: "62", bases: ["JDS", "GHO"] },
  { id: "63-A", bases: ["CBL", "CSA"] },
  { id: "63-B", bases: ["CDR", "JANI"] },
  { id: "64", bases: ["STD", "RBI"] },
  { id: "65", bases: ["STDI"] },
  { id: "66", bases: ["ACM"] },
  { id: "67", bases: ["AET", "BCC"] },
];
const testDocks = [
  ...docks,
  ...Array.from({ length: 23 }, (_, index) => ({
    id: String(68 + index),
    bases: [],
  })),
];

const driverDockOptions = [
  ...docks.filter((dock) => !dock.blocked).map((dock) => dock.id),
  ...Array.from({ length: 23 }, (_, index) => String(68 + index)),
];

const driverStages = [
  {
    key: "chegadaCdc",
    label: "Chegada no CDC",
    waiting: "aguardando liberação",
    complete: "liberada",
    timestamp: "arrivalAt",
  },
  {
    key: "patio",
    label: "Chegada no pátio",
    waiting: "aguardando doca",
    complete: "endocado",
    timestamp: "dockedAt",
  },
  {
    key: "carregamento",
    label: "Carregamento",
    waiting: "aguardando carregamento",
    complete: "finalizado",
    timestamp: "cargoFinishedAt",
  },
  {
    key: "romaneio",
    label: "Romaneio",
    waiting: "aguardando romaneio",
    complete: "romaneio recebido",
    timestamp: "documentationReceivedAt",
  },
  {
    key: "saida",
    label: "Saída",
    waiting: "aguardando liberação",
    complete: "saída liberada",
    timestamp: "releasedAt",
  },
];

const driverStageHelp = {
  chegadaCdc: {
    question: "Sua entrada no CDC foi liberada?",
    waiting: "Cheguei, estou aguardando",
    complete: "Sim, entrada liberada",
    hint: "Registre sua chegada assim que chegar ao CDC.",
  },
  patio: {
    question: "Você já está na doca?",
    waiting: "Estou no pátio, aguardando doca",
    complete: "Sim, já estou na doca",
    hint: "Se estiver na doca, selecione o número dela antes de confirmar.",
  },
  carregamento: {
    question: "O carregamento terminou?",
    waiting: "Ainda estou carregando",
    complete: "Sim, terminou",
    hint: "Avance quando a carga ou descarga estiver finalizada.",
  },
  romaneio: {
    question: "Você recebeu o romaneio?",
    waiting: "Ainda não recebi",
    complete: "Sim, recebi o romaneio",
    hint: "Romaneio é a documentação entregue após o carregamento.",
  },
  saida: {
    question: "Sua saída do CDC foi liberada?",
    waiting: "Ainda aguardo liberação",
    complete: "Sim, fui liberado para sair",
    hint: "Confirme a saída somente após receber a liberação.",
  },
};

const stageValue = (driver, key) => {
  if (!driver) return null;
  if (driver.progress?.[key]?.value) return driver.progress[key].value;
  if (key === "chegadaCdc" && driver.arrivalAt) return "liberada";
  if (key === "patio") {
    if (driver.dockedAt) return "endocado";
    if (driver.arrivalAt) return "aguardando doca";
  }
  if (key === "carregamento") {
    if (driver.cargoFinishedAt) return "finalizado";
    if (driver.dockedAt) return "aguardando carregamento";
  }
  if (key === "romaneio") {
    if (driver.documentationReceivedAt) return "romaneio recebido";
    if (driver.cargoFinishedAt) return "aguardando romaneio";
  }
  if (key === "saida") {
    if (driver.releasedAt) return "saída liberada";
    if (driver.documentationReceivedAt) return "aguardando liberação";
  }
  return null;
};

const operationalProgress = (driver) => {
  if (!driver)
    return { label: "Ainda não chegou", percent: 0, color: "red" };
  if (driver.releasedAt || driver.status === "Veículo liberado")
    return {
      label: driver.manualRelease ? "Liberado manualmente" : "Liberado",
      percent: 100,
      color: "green",
    };
  if (
    driver.documentationReceivedAt ||
    driver.status === "Aguardando liberação de saída" ||
    stageValue(driver, "romaneio") === "romaneio recebido"
  )
    return {
      label: "Romaneio recebido • aguardando saída",
      percent: 85,
      color: "orange",
    };
  if (
    driver.cargoFinishedAt ||
    driver.status === "Aguardando documentação" ||
    stageValue(driver, "carregamento") === "finalizado"
  )
    return {
      label: "Carregado • aguardando romaneio",
      percent: 70,
      color: "orange",
    };
  if (
    driver.dockedAt ||
    driver.status === "Endocado" ||
    stageValue(driver, "patio") === "endocado"
  )
    return {
      label: "Aguardando carregamento • endocado",
      percent: 35,
      color: "yellow",
    };
  if (stageValue(driver, "chegadaCdc") === "aguardando liberação")
    return {
      label: "Chegada no CDC • aguardando liberação",
      percent: 0,
      color: "red",
    };
  return { label: "Aguardando no pátio", percent: 0, color: "red" };
};

function Stat({ icon: Icon, label, value, detail, tone }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`stat ${flipped ? "stat-flipped" : ""}`}
      onClick={() => setFlipped((current) => !current)}
      aria-label={`${label}: ${value}. ${detail}. Toque para virar o cartão.`}
      aria-pressed={flipped}
    >
      <span className="stat-inner">
        <span className="stat-face stat-front">
          <span className={`stat-icon ${tone}`}><Icon size={23} /></span>
          <span className="stat-content"><span className="stat-label">{label}</span><strong>{value}</strong><small>Toque para entender</small></span>
        </span>
        <span className="stat-face stat-back" aria-hidden="true">
          <span className="stat-back-label">{label}</span>
          <strong>{detail}</strong>
          <small>Toque para voltar</small>
        </span>
      </span>
    </button>
  );
}
function Sparkline({ values, tone }) {
  const safe = values.length > 1 ? values : [0, values[0] || 0];
  const max = Math.max(...safe, 1);
  const points = safe
    .map(
      (value, index) =>
        `${index * (100 / (safe.length - 1))},${34 - (value / max) * 28}`,
    )
    .join(" ");
  return (
    <svg
      className={`sparkline ${tone}`}
      viewBox="0 0 100 38"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} />
    </svg>
  );
}
const timestampMillis = (value) =>
  value?.toDate
    ? value.toDate().getTime()
    : value?.seconds
      ? value.seconds * 1000
      : value instanceof Date
        ? value.getTime()
        : typeof value === "string"
          ? new Date(value).getTime()
          : null;
const minutesWaiting = (d, currentTime = Date.now()) => {
  const registeredAt =
    timestampMillis(d.arrivalAt) ||
    timestampMillis(d.createdAt) ||
    timestampMillis(d.updatedAt);
  const releasedAt =
    timestampMillis(d.releasedAt) ||
    timestampMillis(d.progress?.saida?.at);
  const endTime = releasedAt || currentTime;
  return registeredAt
    ? Math.max(0, Math.floor((endTime - registeredAt) / 60000))
    : d.minutes || 0;
};
const formatDuration = (minutes) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}min`
    : `${minutes} min`;
const timeTone = (minutes) =>
  minutes > 60 ? "time-red" : minutes > 30 ? "time-yellow" : "time-green";
const normalizeText = (value) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const SCHEDULE_LINK_KEY = "controle-patio-programacao-link";
const TEST_SCHEDULE_LINK_KEY = "controle-patio-programacao-link-teste";
const PANEL_DEVICE_KEY = "controle-patio-painel-dispositivo";
const DRIVER_SESSION_KEY = "controle-patio-motorista-atual";

const panelDeviceId = () => {
  if (typeof window === "undefined") return "painel";
  let id = localStorage.getItem(PANEL_DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PANEL_DEVICE_KEY, id);
  }
  return id.replace(/[^a-zA-Z0-9-]/g, "");
};

const savedDriverSession = () => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DRIVER_SESSION_KEY) || "{}") || {};
  } catch {
    return {};
  }
};
const parseCsv = (text) => {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i + 1] === '"' && quoted) {
      cell += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};
const sheetCsvUrl = (link) => {
  const raw = (link || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Cole um link válido do Google Planilhas.");
  }
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") || hashParams.get("gid") || "0";
  const range =
    url.searchParams.get("range") || hashParams.get("range") || "";
  const query = url.searchParams.get("tq") || "";
  const publishedId = url.pathname.match(
    /\/spreadsheets(?:\/u\/\d+)?\/d\/e\/([a-zA-Z0-9-_]+)/,
  )?.[1];
  if (publishedId) {
    const params = new URLSearchParams({ output: "csv", gid });
    if (range) params.set("range", range);
    return `https://docs.google.com/spreadsheets/d/e/${publishedId}/pub?${params}`;
  }
  const id =
    url.pathname.match(
      /\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/,
    )?.[1] ||
    url.pathname.match(/\/file\/d\/([a-zA-Z0-9-_]+)/)?.[1] ||
    url.searchParams.get("id");
  if (!id)
    throw new Error(
      "Use um link compartilhado do Google Planilhas ou do arquivo aberto no Google Sheets.",
    );
  const params = new URLSearchParams({ tqx: "out:csv", gid });
  if (range) params.set("range", range);
  if (query) params.set("tq", query);
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${params}`;
};
const programDateKey = (dateValue) => {
  const value = (dateValue || "").trim();
  const iso = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (iso)
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  const parts = value.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (!parts) return null;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  const year = parts[3]
    ? Number(parts[3]) < 100
      ? 2000 + Number(parts[3])
      : Number(parts[3])
    : new Date().getFullYear();
  return new Date(year, month - 1, day).getTime();
};
const scheduleDate = (dateValue, timeValue) => {
  const dateKey = programDateKey(dateValue);
  const parts = (timeValue || "").trim().match(/(\d{1,2}):(\d{2})/);
  if (!dateKey || !parts) return null;
  const result = new Date(dateKey);
  result.setHours(Number(parts[1]), Number(parts[2]), 0, 0);
  return result;
};
const locateScheduleHeader = (csv, requireTimes = true) => {
  for (let rowIndex = 0; rowIndex < Math.min(csv.length, 30); rowIndex++) {
    const headers = csv[rowIndex].map(normalizeText);
    const find = (...terms) =>
      headers.findIndex((header) =>
        terms.some((term) => header === term || header.includes(term)),
      );
    const columns = {
      headerRow: rowIndex,
      plateIndex: find("placa"),
      routeIndex: find("rota", "destino"),
      dateIndex: find("data da programacao", "data programada", "data"),
      timeIndex: find(
        "horario de chegada",
        "hora de chegada",
        "chegada prevista",
        "chegada programada",
        "entrada cdc",
        "chegada",
      ),
      departureIndex: find(
        "horario de saida",
        "hora de saida",
        "saida programada",
        "saida prevista",
        "saida cdc",
        "saida",
      ),
      carrierIndex: find("transportadora", "transportador", "carrier"),
      cdcIndex: find("rdc origem", "cdc", "origem", "base"),
    };
    if (
      columns.plateIndex >= 0 &&
      columns.dateIndex >= 0 &&
      (!requireTimes || (columns.timeIndex >= 0 && columns.departureIndex >= 0))
    )
      return columns;
  }
  return null;
};
const findProgrammedVehicle = async (link, plate) => {
  if (!link) throw new Error("A programação do dia ainda não foi vinculada.");
  const response = await fetch(sheetCsvUrl(link));
  if (!response.ok)
    throw new Error("Não foi possível consultar a programação do dia.");
  const csv = parseCsv(await response.text());
  if (csv.length < 2) throw new Error("A programação vinculada está vazia.");
  const columns = locateScheduleHeader(csv, false);
  if (!columns)
    throw new Error(
      "Não foi possível localizar as colunas Placa e Data na planilha.",
    );
  const { headerRow, plateIndex, routeIndex, dateIndex } = columns;
  const vehicles = csv
    .slice(headerRow + 1)
    .map((row) => ({
      plate: (row[plateIndex] || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
      route: routeIndex >= 0 ? (row[routeIndex] || "").trim() : "",
      date: row[dateIndex] || "",
    }))
    .filter((item) => item.plate && programDateKey(item.date));
  if (!vehicles.length)
    throw new Error("Nenhum veículo foi encontrado na programação vigente.");
  const latestDate = Math.max(
    ...vehicles.map((item) => programDateKey(item.date)),
  );
  return (
    vehicles.find(
      (item) =>
        programDateKey(item.date) === latestDate && item.plate === plate,
    ) || null
  );
};

function DockMap({ liveDocks, dockList = docks, expanded, collapsed = false, onToggle, onExpand, onClose }) {
  const available =
    dockList.filter((dock) => !dock.blocked).length -
    Object.keys(liveDocks).length;
  return (
    <section className={`panel dock-panel ${expanded ? "dock-modal" : ""}`}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">GU - GUARULHOS • TEMPO REAL</p>
          <h2>Mapa operacional das docas</h2>
          <p>{dockList.length} posições físicas • clique para visualizar o mapa completo</p>
        </div>
        <div className="dock-actions">
          <span className="dock-count">{available} disponíveis</span>
          {!expanded && onToggle ? (
            <button className="collapse-map" onClick={onToggle} aria-expanded={!collapsed}>
              <ChevronRight className={collapsed ? "" : "open"} size={17} />
              {collapsed ? "Mostrar docas" : "Recolher mapa"}
            </button>
          ) : null}
          <button
            className="expand-map"
            onClick={expanded ? onClose : onExpand}
            aria-label={expanded ? "Fechar mapa" : "Expandir mapa"}
          >
            {expanded ? <X size={18} /> : <Maximize2 size={18} />}{" "}
            {expanded ? "Fechar" : "Ver mapa inteiro"}
          </button>
        </div>
      </div>
      {!collapsed || expanded ? <div className="dock-grid">
        {dockList.map((d) => {
          const active = liveDocks[d.id];
          return (
            <article
              key={d.id}
              className={`dock-card ${d.blocked ? "blocked" : ""} ${active ? "occupied" : ""}`}
            >
              <div className="dock-number">
                <Truck size={17} />
                <strong>{d.id}</strong>
              </div>
              {active ? (
                <div className="dock-live">
                  <b>{active.plate}</b>
                  <span>Rota {active.route || "não informada"}</span>
                  {active.status === "Aguardando documentação" ? (
                    <span>Aguardando romaneio</span>
                  ) : null}
                  {active.status === "Aguardando liberação de saída" ? (
                    <span>Romaneio recebido • aguardando saída</span>
                  ) : null}
                </div>
              ) : (
                <div className="dock-route-empty">Sem veículo registrado</div>
              )}
              <small>
                {d.blocked ? "INTERDITADA" : active ? "OCUPADA" : "DISPONÍVEL"}
              </small>
            </article>
          );
        })}
      </div> : null}
      {!collapsed || expanded ? <div className="conveyor">
        <span>Esteira / Conveyor</span>
      </div> : null}
    </section>
  );
}

function Dashboard({ testMode = false }) {
  const activeNav = "Visão geral";
  const [deviceId] = useState(panelDeviceId);
  const [query, setQuery] = useState("");
  const [driverRecords, setDriverRecords] = useState(
    firebaseReady ? [] : initialDrivers,
  );
  const [turnStartedAt, setTurnStartedAt] = useState(null);
  const [closedProgramDate, setClosedProgramDate] = useState("");
  const [closingTurn, setClosingTurn] = useState(false);
  const [turnMessage, setTurnMessage] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapCollapsed, setMapCollapsed] = useState(testMode);
  const [scheduleLink, setScheduleLink] = useState(() =>
    typeof window === "undefined"
      ? ""
      : localStorage.getItem(
          testMode ? TEST_SCHEDULE_LINK_KEY : SCHEDULE_LINK_KEY,
        ) || "",
  );
  const [scheduleRows, setScheduleRows] = useState([]);
  const [scheduleReferenceDate, setScheduleReferenceDate] = useState("");
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [manualReleasePlate, setManualReleasePlate] = useState("");
  const [manualReleaseError, setManualReleaseError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [testCarrier, setTestCarrier] = useState("");
  const [testCdc, setTestCdc] = useState("TODOS");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundPromptOpen, setSoundPromptOpen] = useState(testMode);
  const [testPopup, setTestPopup] = useState(null);
  const [waveOpen, setWaveOpen] = useState(false);
  const [delayModalLevel, setDelayModalLevel] = useState(null);
  const soundContextRef = useRef(null);
  const filterDetailsRef = useRef(null);
  const shownRomaneioPopupRef = useRef(new Set());
  const alertedRomaneioRef = useRef(new Set());
  const alertedArrivalRef = useRef(new Set());
  const pageCopy = [
    "Visão geral do pátio",
    "Acompanhe toda a operação em tempo real em um único painel.",
  ];
  useEffect(() => {
    if (!firebaseReady || !db) return;
    return onSnapshot(collection(db, "presencas"), (snap) =>
      setDriverRecords(
        snap.docs.map((item) => ({ id: item.id, ...item.data() })),
      ),
    );
  }, []);
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const configId = testMode
      ? `programacao_teste_${deviceId}`
      : "programacao";
    const storageKey = testMode
      ? TEST_SCHEDULE_LINK_KEY
      : SCHEDULE_LINK_KEY;
    return onSnapshot(doc(db, "configuracoes", configId), (snap) => {
      if (snap.exists()) {
        const savedLink = (snap.data().link || "").trim();
        if (savedLink) {
          setScheduleLink(savedLink);
          localStorage.setItem(storageKey, savedLink);
        }
      }
    });
  }, [testMode, deviceId]);
  useEffect(() => {
    if (!testMode) return;
    const currentLink = scheduleLink.trim();
    if (currentLink)
      localStorage.setItem(TEST_SCHEDULE_LINK_KEY, currentLink);
  }, [testMode, scheduleLink]);
  useEffect(() => {
    if (!firebaseReady || !db) return;
    return onSnapshot(doc(db, "configuracoes", "operacao"), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setTurnStartedAt(timestampMillis(data.turnStartedAt));
      setClosedProgramDate(data.closedProgramDate || "");
    });
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!testMode) return;
    const closeFilter = (event) => {
      const details = filterDetailsRef.current;
      if (!details?.open) return;
      if (event.type === "keydown" && event.key === "Escape") {
        details.open = false;
        return;
      }
      if (event.type === "pointerdown" && !details.contains(event.target))
        details.open = false;
    };
    document.addEventListener("pointerdown", closeFilter);
    document.addEventListener("keydown", closeFilter);
    return () => {
      document.removeEventListener("pointerdown", closeFilter);
      document.removeEventListener("keydown", closeFilter);
    };
  }, [testMode]);
  useEffect(() => {
    if (!scheduleLink) {
      setScheduleRows([]);
      setScheduleReferenceDate("");
      setScheduleError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setScheduleLoading(true);
      try {
        const response = await fetch(sheetCsvUrl(scheduleLink));
        if (!response.ok)
          throw new Error("Não foi possível acessar a planilha.");
        const csv = parseCsv(await response.text());
        if (csv.length < 2)
          throw new Error("A planilha não possui programação para leitura.");
        const columns = locateScheduleHeader(csv, true);
        if (!columns)
          throw new Error(
            "Não foi possível localizar Placa, Data, Horário de chegada e Horário de saída no cabeçalho.",
          );
        const {
          headerRow,
          plateIndex,
          routeIndex,
          dateIndex,
          timeIndex,
          departureIndex,
          carrierIndex,
          cdcIndex,
        } = columns;
        const parsed = csv
          .slice(headerRow + 1)
          .map((row) => ({
            plate: (row[plateIndex] || "")
              .replace(/[^a-zA-Z0-9]/g, "")
              .toUpperCase(),
            route: routeIndex >= 0 ? row[routeIndex] || "" : "",
            date: row[dateIndex] || "",
            time: row[timeIndex] || "",
            departureTime: row[departureIndex] || "",
            carrier: carrierIndex >= 0 ? (row[carrierIndex] || "").trim() : "",
            cdc: cdcIndex >= 0 ? (row[cdcIndex] || "").trim() : "",
          }))
          .filter(
            (item) =>
              item.plate &&
              item.time &&
              item.departureTime &&
              programDateKey(item.date),
          );
        if (!parsed.length)
          throw new Error(
            "Nenhuma programação com horários válidos foi encontrada.",
          );
        const latestDate = Math.max(
          ...parsed.map((item) => programDateKey(item.date)),
        );
        const latestRows = parsed.filter(
          (item) => programDateKey(item.date) === latestDate,
        );
        if (!cancelled) {
          setScheduleRows(latestRows);
          setScheduleReferenceDate(latestRows[0].date);
          setScheduleError("");
        }
      } catch (error) {
        if (!cancelled) {
          setScheduleRows([]);
          setScheduleReferenceDate("");
          setScheduleError(error.message);
        }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    };
    load();
    const refresh = setInterval(load, 300000);
    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, [scheduleLink]);
  const allDrivers = useMemo(
    () =>
      driverRecords.filter(
        (driver) =>
          !turnStartedAt ||
          (timestampMillis(driver.updatedAt) ||
            timestampMillis(driver.createdAt) ||
            0) >= turnStartedAt,
      ),
    [driverRecords, turnStartedAt],
  );
  const activeDrivers = useMemo(
    () =>
      allDrivers
        .filter((d) => d.status !== "Veículo liberado")
        .sort(
          (a, b) => (b.arrivalAt?.seconds || 0) - (a.arrivalAt?.seconds || 0),
        )
        .reverse(),
    [allDrivers],
  );
  const carrierOptions = useMemo(
    () =>
      [...new Set(scheduleRows.map((item) => item.carrier).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [scheduleRows],
  );
  const cdcOptions = useMemo(
    () =>
      [...new Set(scheduleRows.map((item) => item.cdc).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [scheduleRows],
  );
  const visibleScheduleRows = useMemo(
    () =>
      !testMode
        ? scheduleRows
        : !testCarrier
          ? []
        : scheduleRows.filter(
            (item) =>
              item.carrier === testCarrier &&
              (testCdc === "TODOS" || item.cdc === testCdc),
          ),
    [scheduleRows, testMode, testCarrier, testCdc],
  );
  const visiblePlateSet = useMemo(
    () => new Set(visibleScheduleRows.map((item) => item.plate)),
    [visibleScheduleRows],
  );
  const displayAllDrivers = useMemo(
    () =>
      testMode
        ? allDrivers.filter((driver) => visiblePlateSet.has(driver.plate))
        : allDrivers,
    [testMode, allDrivers, visiblePlateSet],
  );
  const displayActiveDrivers = useMemo(
    () => displayAllDrivers.filter((driver) => driver.status !== "Veículo liberado"),
    [displayAllDrivers],
  );
  const filtered = useMemo(
    () => {
      const rows = scheduleRows.length || testMode
        ? visibleScheduleRows.map((item) => {
            const record = allDrivers.find(
              (driver) =>
                driver.plate === item.plate && driver.programDate === item.date,
            );
            return {
              ...record,
              plate: item.plate,
              route: item.route || record?.route || "",
              plannedArrival: item.time,
              plannedDeparture: item.departureTime,
              carrier: item.carrier || record?.carrier || "",
              cdc: item.cdc || record?.cdc || "",
              registered: Boolean(record),
            };
          })
        : allDrivers.map((driver) => ({ ...driver, registered: true }));
      return rows
        .filter((driver) =>
          `${driver.plate || ""} ${driver.name || ""} ${driver.route || ""} ${driver.location || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          operationalProgress(b.registered ? b : null).percent -
          operationalProgress(a.registered ? a : null).percent,
        );
    },
    [query, visibleScheduleRows, allDrivers, scheduleRows.length, testMode],
  );
  const liveDocks = useMemo(
    () =>
      Object.fromEntries(
        displayActiveDrivers
          .filter(
            (d) =>
              (d.status === "Endocado" ||
                d.status === "Aguardando documentação" ||
                d.status === "Aguardando liberação de saída") &&
              d.dockId,
          )
          .map((d) => [d.dockId, d]),
      ),
    [displayActiveDrivers],
  );
  const waiting = displayActiveDrivers.filter((d) => d.status === "Aguardando").length;
  const documentationWaiting = displayActiveDrivers.filter(
    (d) => d.status === "Aguardando documentação",
  );
  const docked = displayActiveDrivers.filter((d) => d.status === "Endocado").length;
  const released = displayAllDrivers.filter(
    (d) => d.status === "Veículo liberado",
  ).length;
  const operationalDocks = testMode ? testDocks : docks;
  const availableDocks = operationalDocks.filter(
    (d) => !d.blocked && !liveDocks[d.id],
  );
  const dockCapacity = operationalDocks.filter((d) => !d.blocked).length;
  const occupiedDocks = dockCapacity - availableDocks.length;
  const dockOccupancy = dockCapacity
    ? Math.round((occupiedDocks / dockCapacity) * 100)
    : 0;
  const departureAlerts = useMemo(
    () =>
      scheduleReferenceDate && closedProgramDate === scheduleReferenceDate
        ? []
        : visibleScheduleRows
            .map((item) => {
              const record = displayAllDrivers.find((d) => d.plate === item.plate);
              if (
                record?.status === "Endocado" ||
                record?.status === "Aguardando documentação" ||
                record?.status === "Aguardando liberação de saída" ||
                record?.status === "Veículo liberado"
              )
                return null;
              const driver = displayActiveDrivers.find((d) => d.plate === item.plate);
              const departure = scheduleDate(item.date, item.time);
              if (!departure) return null;
              const minutes = Math.ceil((departure.getTime() - now) / 60000);
              return { ...item, driver, minutes, departure };
            })
            .filter((item) => item && item.departure.getTime() < now)
            .sort((a, b) => a.minutes - b.minutes),
    [
      visibleScheduleRows,
      scheduleReferenceDate,
      closedProgramDate,
      displayAllDrivers,
      displayActiveDrivers,
      now,
    ],
  );
  const filteredDepartures = useMemo(
    () =>
      departureAlerts.filter((item) =>
        item.plate.includes(
          scheduleQuery.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
        ),
      ),
    [departureAlerts, scheduleQuery],
  );
  const arrivalSla = useMemo(() => {
    const total = visibleScheduleRows.length;
    const arrived = visibleScheduleRows.filter((item) =>
      displayAllDrivers.some(
        (driver) =>
          driver.plate === item.plate &&
          driver.arrivalAt,
      ),
    ).length;
    const percent = total ? Math.round((arrived / total) * 100) : 0;
    return { total, arrived, percent, missing: Math.max(0, 100 - percent) };
  }, [visibleScheduleRows, displayAllDrivers]);
  const arrivalCriticalRows = useMemo(
    () =>
      visibleScheduleRows
        .map((item) => {
          const arrived = displayAllDrivers.some(
            (driver) => driver.plate === item.plate && driver.arrivalAt,
          );
          const planned = scheduleDate(item.date, item.time);
          if (arrived || !planned || planned.getTime() >= now) return null;
          const lateMinutes = Math.floor((now - planned.getTime()) / 60000);
          const level = lateMinutes <= 10 ? 1 : lateMinutes <= 30 ? 2 : 3;
          return { ...item, lateMinutes, level };
        })
        .filter(Boolean)
        .sort((a, b) => b.lateMinutes - a.lateMinutes),
    [visibleScheduleRows, displayAllDrivers, now],
  );
  const delayTotals = useMemo(
    () => ({
      1: arrivalCriticalRows.filter((item) => item.level === 1).length,
      2: arrivalCriticalRows.filter((item) => item.level === 2).length,
      3: arrivalCriticalRows.filter((item) => item.level === 3).length,
    }),
    [arrivalCriticalRows],
  );
  const arrivalWave = useMemo(() => {
    const operationalHours = [22, 23, 0, 1, 2, 3, 4, 5, 6];
    const buckets = new Map(
      operationalHours.map((hour) => [hour, { hour, planned: 0, arrived: 0 }]),
    );
    visibleScheduleRows.forEach((item) => {
      const match = String(item.time || "").match(/(\d{1,2}):/);
      if (!match) return;
      const hour = Number(match[1]);
      if (!buckets.has(hour)) return;
      const current = buckets.get(hour);
      current.planned += 1;
      if (displayAllDrivers.some((driver) => driver.plate === item.plate && driver.arrivalAt))
        current.arrived += 1;
      buckets.set(hour, current);
    });
    const values = operationalHours.map((hour) => buckets.get(hour));
    const max = Math.max(1, ...values.map((item) => item.planned));
    const points = (key) =>
      values
        .map((item, index) => {
          const x = (index / (values.length - 1)) * 300;
          const y = 62 - (item[key] / max) * 50;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    const fullPoints = (key) =>
      values
        .map((item, index) => {
          const x = 45 + (index / (values.length - 1)) * 630;
          const y = 190 - (item[key] / max) * 145;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    return {
      planned: points("planned"),
      arrived: points("arrived"),
      fullPlanned: fullPoints("planned"),
      fullArrived: fullPoints("arrived"),
      values,
      max,
      first: "22h",
      last: "06h",
    };
  }, [visibleScheduleRows, displayAllDrivers]);
  const playAlert = (kind) => {
    if (!soundEnabled || !soundContextRef.current) return;
    const context = soundContextRef.current;
    const notes = kind === "romaneio" ? [880, 880] : [390, 320, 390];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.23;
      oscillator.type = kind === "romaneio" ? "sine" : "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  };
  const enableSounds = async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = soundContextRef.current || new AudioContext();
    soundContextRef.current = context;
    await context.resume();
    setSoundEnabled(true);
    setSoundPromptOpen(false);
  };
  useEffect(() => {
    if (!testMode) return;
    const overdueRomaneio = displayActiveDrivers.filter((driver) => {
      if (driver.status !== "Aguardando documentação") return false;
      const startedAt = timestampMillis(driver.cargoFinishedAt);
      return startedAt && now - startedAt > 10 * 60000;
    });
    const newPopupRomaneio = overdueRomaneio.filter(
      (driver) => !shownRomaneioPopupRef.current.has(driver.plate),
    );
    if (newPopupRomaneio.length) {
      newPopupRomaneio.forEach((driver) => shownRomaneioPopupRef.current.add(driver.plate));
      setTestPopup({
        message: "Motorista aguardando romaneio a mais de 10min",
        plates: newPopupRomaneio.map((driver) => driver.plate).join(", "),
      });
    }
    const newRomaneio = soundEnabled ? overdueRomaneio.filter(
      (driver) => !alertedRomaneioRef.current.has(driver.plate),
    ) : [];
    if (newRomaneio.length) {
      newRomaneio.forEach((driver) => alertedRomaneioRef.current.add(driver.plate));
      playAlert("romaneio");
    }
    const newArrivalDelays = soundEnabled ? arrivalCriticalRows.filter((item) => {
      const key = `${item.date}-${item.plate}`;
      if (alertedArrivalRef.current.has(key)) return false;
      alertedArrivalRef.current.add(key);
      return true;
    }) : [];
    if (newArrivalDelays.length) playAlert("chegada");
  }, [testMode, soundEnabled, displayActiveDrivers, arrivalCriticalRows, now]);
  const saveScheduleLink = async () => {
    setScheduleError("");
    try {
      const savedLink = scheduleLink.trim();
      sheetCsvUrl(savedLink);
      localStorage.setItem(
        testMode ? TEST_SCHEDULE_LINK_KEY : SCHEDULE_LINK_KEY,
        savedLink,
      );
      await setDoc(
        doc(
          db,
          "configuracoes",
          testMode ? `programacao_teste_${deviceId}` : "programacao",
        ),
        testMode
          ? {
              link: savedLink,
              type: "programacao_teste",
              deviceId,
              updatedAt: serverTimestamp(),
            }
          : { link: savedLink, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setScheduleLink(savedLink);
      if (testMode) {
        setTestCarrier("");
        setTestCdc("TODOS");
      }
    } catch (error) {
      setScheduleError(error.message || "Não foi possível salvar o link.");
    }
  };
  const releaseManually = async (driver) => {
    if (
      !["Endocado", "Aguardando documentação", "Aguardando liberação de saída"].includes(driver.status) ||
      !window.confirm(
        `Confirmar a saída do veículo ${driver.plate} da Doca ${driver.dockId}?`,
      )
    )
      return;
    setManualReleasePlate(driver.plate);
    setManualReleaseError("");
    try {
      const payload = {
        plate: driver.plate,
        route: driver.route || "",
        status: "Veículo liberado",
        location: driver.documentationReceivedAt
          ? "Saída liberada manualmente pelo administrador"
          : "Liberação manual pelo administrador — documentação não confirmada",
        dockId: null,
        releasedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        manualRelease: true,
        progress: {
          saida: { value: "saída liberada", at: serverTimestamp() },
        },
      };
      await setDoc(doc(db, "presencas", driver.plate), payload, {
        merge: true,
      });
      await addDoc(collection(db, "movimentacoes"), {
        ...payload,
        previousDockId: driver.dockId || null,
        event: "VEICULO_LIBERADO_MANUAL",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Falha na liberação manual:", error);
      setManualReleaseError(
        `Não foi possível liberar o veículo ${driver.plate}. Tente novamente.`,
      );
    } finally {
      setManualReleasePlate("");
    }
  };
  const closeTurn = async () => {
    if (
      closingTurn ||
      !window.confirm(
        "Encerrar o turno agora? O painel será zerado para a próxima operação.",
      )
    )
      return;
    setClosingTurn(true);
    setTurnMessage("");
    try {
      try {
        await addDoc(collection(db, "turnos"), {
          programDate: scheduleReferenceDate || null,
          vehicles: allDrivers.length,
          waiting,
          docked,
          released,
          startedAt: turnStartedAt ? new Date(turnStartedAt) : null,
          closedAt: serverTimestamp(),
        });
      } catch (historyError) {
        console.warn(
          "Não foi possível salvar o resumo do turno:",
          historyError,
        );
      }
      const cutoff = Date.now();
      await setDoc(
        doc(db, "configuracoes", "operacao"),
        {
          turnStartedAt: serverTimestamp(),
          lastClosedAt: serverTimestamp(),
          closedProgramDate: scheduleReferenceDate || "",
          lastClosedTotals: {
            vehicles: allDrivers.length,
            waiting,
            docked,
            released,
          },
        },
        { merge: true },
      );
      setTurnStartedAt(cutoff);
      setClosedProgramDate(scheduleReferenceDate || "");
      setTurnMessage(
        "Turno encerrado. O painel está pronto para a próxima operação.",
      );
    } catch (error) {
      console.error("Falha ao encerrar turno:", error);
      setTurnMessage("Não foi possível encerrar o turno. Tente novamente.");
    } finally {
      setClosingTurn(false);
    }
  };
  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">OPERAÇÃO • TEMPO REAL</p>
          <h1>{pageCopy[0]}</h1>
          <p className="sub">{pageCopy[1]}</p>
        </div>
        {testMode ? (
          <div className="test-header-actions">
            <button
              className={`sound-toggle ${soundEnabled ? "active" : ""}`}
              onClick={enableSounds}
            >
              {soundEnabled ? "🔊 Alertas sonoros ativos" : "🔇 Ativar alertas sonoros"}
            </button>
            <span className="test-mode-badge">AMBIENTE DE TESTE</span>
          </div>
        ) : (
          <button
            className="close-turn-button"
            onClick={closeTurn}
            disabled={closingTurn}
          >
            <LogOut size={17} />
            {closingTurn ? "Encerrando..." : "Encerrar turno"}
          </button>
        )}
      </header>
      {turnMessage ? (
        <p
          className={`turn-message ${turnMessage.startsWith("Não") ? "error" : ""}`}
        >
          {turnMessage}
        </p>
      ) : null}
      {activeNav === "Visão geral" ? (
        <>
          <section className="stats">
            <Stat
              icon={Truck}
              label="No pátio agora"
              value={displayActiveDrivers.length}
              detail="Capacidade monitorada em tempo real"
              tone="blue"
            />
            <Stat
              icon={Clock3}
              label="Em espera"
              value={waiting}
              detail="Fila por ordem de chegada"
              tone="amber"
            />
            <Stat
              icon={Container}
              label="Nas docas"
              value={docked}
              detail={`${availableDocks.length} posições disponíveis`}
              tone="cyan"
            />
            <Stat
              icon={CircleCheck}
              label="Veículos liberados"
              value={released}
              detail="Após recebimento da documentação"
              tone="green"
            />
          </section>
          <section className="panel schedule-panel">
            <div className="schedule-config">
              <div>
                <p className="eyebrow">PROGRAMAÇÃO DO DIA</p>
                <h2>Horários programados de chegada ao CDC</h2>
                <p>
                  O horário de chegada define o prazo para o veículo estar
                  endocado.
                </p>
                {scheduleReferenceDate ? (
                  <span className="schedule-date">
                    Programação ativa: {scheduleReferenceDate} • Turno 22h–6h20
                  </span>
                ) : null}
              </div>
              <div className="schedule-input">
                <input
                  value={scheduleLink}
                  onChange={(e) => setScheduleLink(e.target.value)}
                  placeholder="Cole aqui o link do Google Planilhas"
                />
                <button
                  onClick={saveScheduleLink}
                  disabled={!scheduleLink.trim() || scheduleLoading}
                >
                  {scheduleLoading ? "Lendo..." : "Salvar e atualizar"}
                </button>
              </div>
            </div>
            {departureAlerts.length ? (
              <div className="schedule-search">
                <Search size={16} />
                <input
                  value={scheduleQuery}
                  onChange={(e) => setScheduleQuery(e.target.value)}
                  placeholder="Pesquisar placa atrasada"
                />
              </div>
            ) : null}
            {scheduleError ? (
              <p className="schedule-error">
                <AlertTriangle size={16} />
                {scheduleError}
              </p>
            ) : null}
            {filteredDepartures.length ? (
              <div className="departure-alerts">
                {filteredDepartures.map((item) => {
                  const registered = Boolean(item.driver);
                  const alertLabel = registered
                    ? "ENDOCAMENTO ATRASADO"
                    : "ATRASO NA CHEGADA AO CDC";
                  return (
                    <article
                      key={`${item.plate}-${item.time}`}
                      className="departure-late"
                    >
                      <AlertTriangle size={20} />
                      <div className="departure-alert-content">
                        <strong className="departure-alert-plate">{item.plate}</strong>
                        <b className="departure-alert-reason" title={alertLabel}>{alertLabel}</b>
                        <span className="departure-alert-route" title={item.route || item.driver?.route || "Rota não informada"}>
                          {item.route || item.driver?.route || "Rota não informada"}
                        </span>
                        <span className="departure-alert-time">Chegada programada: {item.time}</span>
                        <small className="departure-alert-location" title={registered ? item.driver.location : "Ainda não registrado na portaria"}>
                          {registered
                            ? item.driver.location
                            : "Ainda não registrado na portaria"}
                        </small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : departureAlerts.length && scheduleQuery ? (
              <p className="schedule-empty">
                Nenhuma placa encontrada na programação.
              </p>
            ) : scheduleLink && !scheduleError && !scheduleLoading ? (
              <p className="schedule-ok">
                <CircleCheck size={16} /> Nenhum veículo atrasado na programação
                vigente.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
      {activeNav === "Visão geral" ? (
        <section className={`grid-main ${testMode ? "test-grid-main" : ""}`}>
          <div className="panel live">
            <div className="panel-head">
              <div>
                <h2>Acompanhamento operacional</h2>
                <p>Horários programados e evolução automática pelo link do motorista e pelos QR Codes</p>
              </div>
              <div className="accompaniment-actions">
                {testMode ? (
                  <details className="test-filters" ref={filterDetailsRef}>
                    <summary>
                      {testCarrier ? `Transportadora • ${testCarrier}` : "Selecionar transportadora"}{testCdc !== "TODOS" ? ` • ${testCdc}` : ""}
                    </summary>
                    <div className="test-filter-fields">
                      <label>
                        Transportadora
                        <select value={testCarrier} onChange={(event) => setTestCarrier(event.target.value)}>
                          <option value="">Selecione...</option>
                          {carrierOptions.map((carrier) => <option key={carrier} value={carrier}>{carrier}</option>)}
                        </select>
                      </label>
                      <label>
                        CDC
                        <select value={testCdc} onChange={(event) => setTestCdc(event.target.value)}>
                          <option value="TODOS">Todos</option>
                          {cdcOptions.map((cdc) => <option key={cdc} value={cdc}>{cdc}</option>)}
                        </select>
                      </label>
                    </div>
                  </details>
                ) : null}
                <div className="search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar placa ou motorista"
                  />
                </div>
              </div>
            </div>
            {manualReleaseError ? (
              <p className="manual-release-error">
                <AlertTriangle size={15} />
                {manualReleaseError}
              </p>
            ) : null}
            <div className="progress-legend" aria-label="Legenda do farol operacional">
              <span><i className="red" /> Pátio</span>
              <span><i className="yellow" /> Endocado</span>
              <span><i className="orange" /> Carregado</span>
              <span><i className="green" /> Liberado</span>
            </div>
            <div className="table-wrap">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>ORDEM</th>
                    <th>VEÍCULO</th>
                    <th>PROGRAMAÇÃO</th>
                    <th>LOCALIZAÇÃO</th>
                    <th>PERMANÊNCIA</th>
                    <th>ROTA</th>
                    <th>FAROL OPERACIONAL</th>
                    <th>AÇÃO MANUAL</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? (
                    filtered.map((d, index) => {
                      const mins = minutesWaiting(d, now);
                      const progress = operationalProgress(d.registered ? d : null);
                      return (
                        <tr key={`${d.plate}-${d.plannedArrival || index}`}>
                          <td>
                            <b>#{index + 1}</b>
                          </td>
                          <td>
                            <b>{d.plate}</b>
                            <span>{d.name || (d.registered ? "Registro confirmado" : "Programação vinculada")}</span>
                          </td>
                          <td>
                            <div className="scheduled-times">
                              <span>Chegada <b>{d.plannedArrival || "—"}</b></span>
                              <span>Saída <b>{d.plannedDeparture || "—"}</b></span>
                            </div>
                          </td>
                          <td>
                            <b className="place">
                              <MapPin size={14} />
                              {d.place || d.location || "Ainda não chegou ao CDC"}
                            </b>
                            <span>{d.carrier || ""}</span>
                          </td>
                          <td>
                            {d.registered ? (
                              <span className={`time-chip ${timeTone(mins)}`}>
                                <Clock3 size={12} aria-hidden="true" />
                                {formatDuration(mins)}
                              </span>
                            ) : "—"}
                          </td>
                          <td>{d.route || "—"}</td>
                          <td>
                            <div
                              className={`progress-signal ${progress.color}`}
                              role="progressbar"
                              aria-label={`${d.plate}: ${progress.label}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={progress.percent}
                            >
                              <div className="progress-signal-label">
                                <b>{progress.label}</b>
                                <strong>{progress.percent}%</strong>
                              </div>
                              <div className="progress-signal-track">
                                <span style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress.percent)) / 100})` }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            {!testMode && ["Endocado", "Aguardando documentação", "Aguardando liberação de saída"].includes(d.status) ? (
                              <button
                                className="manual-release-button"
                                disabled={manualReleasePlate === d.plate}
                                onClick={() => releaseManually(d)}
                              >
                                {manualReleasePlate === d.plate
                                  ? "Liberando..."
                                  : "Liberar veículo"}
                              </button>
                            ) : (
                              <span className="automatic-note">
                                {testMode ? "Somente visualização" : "Automático"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-row">
                        {testMode && !testCarrier
                          ? "Selecione uma transportadora no filtro para exibir o acompanhamento"
                          : "Nenhum veículo na programação vigente"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="panel summary">
            <div className="panel-head">
              <div>
                <h2>Ocupação</h2>
                <p>Docas disponíveis e movimentação no CDC</p>
              </div>
            </div>
            <div className="occupancy-chart" role="img" aria-label={`${occupiedDocks} de ${dockCapacity} docas ocupadas; ${availableDocks.length} livres. ${displayActiveDrivers.length} veículos no CDC.`}>
              <div className="occupancy-chart-total">
                <strong>{dockOccupancy}%</strong>
                <span>das docas ocupadas</span>
              </div>
              <div className="occupancy-chart-row">
                <div><span>Docas ocupadas</span><b>{occupiedDocks} / {dockCapacity}</b></div>
                <div className="occupancy-chart-track"><span style={{ width: `${dockOccupancy}%` }} /></div>
              </div>
              <div className="occupancy-chart-row">
                <div><span>Docas disponíveis</span><b>{availableDocks.length}</b></div>
                <div className="occupancy-chart-track available"><span style={{ width: `${100 - dockOccupancy}%` }} /></div>
              </div>
              <div className="occupancy-chart-stats">
                <div><b>{displayActiveDrivers.length}</b><span>no CDC</span></div>
                <div><b>{waiting}</b><span>aguardando</span></div>
                <div><b>{documentationWaiting.length}</b><span>aguardando romaneio</span></div>
                <div><b>{released}</b><span>liberados hoje</span></div>
              </div>
            </div>
            {testMode && testCarrier ? (
              <section className="test-side-dashboard" aria-label="Indicadores de chegada">
                <div className="test-side-title">
                  <div>
                    <p className="eyebrow">SLA DE CHEGADA</p>
                    <h3>Fluxo dos motoristas</h3>
                  </div>
                  <strong>{arrivalSla.percent}%</strong>
                </div>
                <div className="arrival-sla-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={arrivalSla.percent}>
                  <span style={{ width: `${arrivalSla.percent}%` }} />
                </div>
                <div className="arrival-sla-copy compact">
                  <b>{arrivalSla.arrived} chegaram</b>
                  <span>{arrivalSla.total - arrivalSla.arrived} pendentes</span>
                  <small>{arrivalSla.missing}% ainda não chegou</small>
                </div>
                <button type="button" className="arrival-wave" onClick={() => setWaveOpen(true)} aria-label="Abrir gráfico completo do horário operacional">
                  <div className="arrival-wave-head">
                    <b>Movimento por horário</b>
                    <span><i className="planned" /> Programados <i className="arrived" /> Chegaram</span>
                  </div>
                  <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Ondas de veículos programados e que chegaram">
                    <line x1="0" y1="62" x2="300" y2="62" />
                    <polyline className="wave-planned" points={arrivalWave.planned} />
                    <polyline className="wave-arrived" points={arrivalWave.arrived} />
                  </svg>
                  <div className="arrival-wave-axis"><span>{arrivalWave.first}</span><span>CLIQUE PARA AMPLIAR</span><span>{arrivalWave.last}</span></div>
                </button>
                <div className="delay-levels compact-levels">
                  {[1, 2, 3].map((level) => {
                    const totalDelayed = arrivalCriticalRows.length;
                    const share = totalDelayed ? Math.round((delayTotals[level] / totalDelayed) * 100) : 0;
                    const ranges = { 1: "até 10 min", 2: "11 a 30 min", 3: "+30 min" };
                    return (
                      <button
                        type="button"
                        key={level}
                        className={`delay-level level-${level} ${delayTotals[level] ? "active" : ""}`}
                        disabled={!delayTotals[level]}
                        onClick={() => setDelayModalLevel(level)}
                        aria-label={`Abrir veículos com atraso nível ${level}`}
                      >
                        <div><span>NÍVEL {level}</span><strong>{delayTotals[level]}</strong></div>
                        <small>{ranges[level]}</small>
                        <em>{delayTotals[level] ? `${share}% dos atrasos • clique para ver` : "Sem ocorrência"}</em>
                        <i className="level-motion" style={{ width: `${Math.max(8, share)}%` }} />
                      </button>
                    );
                  })}
                </div>
                {arrivalCriticalRows.length ? (
                  <button type="button" className="critical-time-alert compact-alert" onClick={() => setDelayModalLevel("all")}>
                    <AlertTriangle size={17} />
                    <div>
                      <b>{arrivalCriticalRows.length} veículo(s) em criticidade</b>
                      <span>Maior atraso: {arrivalCriticalRows[0].plate} • {arrivalCriticalRows[0].lateMinutes} min • clique para visualizar</span>
                    </div>
                  </button>
                ) : null}
              </section>
            ) : testMode ? (
              <div className="test-dashboard-collapsed">
                <span>PAINEL RECOLHIDO</span>
                <b>Selecione uma transportadora</b>
                <small>Os indicadores, níveis de atraso e gráfico serão exibidos após a seleção.</small>
              </div>
            ) : null}
            <div className="alert">
              <AlertTriangle size={18} />
              <div>
                <b>Doca 58 interditada</b>
                <span>Posição indisponível para a operação.</span>
              </div>
            </div>
          </aside>
        </section>
      ) : null}
      {activeNav === "Visão geral" ? (
        <>
          <DockMap
            liveDocks={liveDocks}
            dockList={operationalDocks}
            expanded={false}
            collapsed={testMode && mapCollapsed}
            onToggle={testMode ? () => setMapCollapsed((current) => !current) : null}
            onExpand={() => setMapOpen(true)}
          />
          {mapOpen ? (
            <DockMap
              liveDocks={liveDocks}
              dockList={operationalDocks}
              expanded
              onClose={() => setMapOpen(false)}
            />
          ) : null}
        </>
      ) : null}
      {testMode && testPopup ? (
        <div className="test-alert-overlay" role="dialog" aria-modal="true" aria-labelledby="test-alert-title">
          <div className="test-alert-popup">
            <AlertTriangle size={34} />
            <p className="eyebrow">ALERTA OPERACIONAL</p>
            <h2 id="test-alert-title">{testPopup.message}</h2>
            <p>Veículo(s): <b>{testPopup.plates}</b></p>
            <button onClick={() => setTestPopup(null)}>Entendi</button>
          </div>
        </div>
      ) : null}
      {testMode && soundPromptOpen ? (
        <div className="sound-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="sound-prompt-title">
          <section className="sound-prompt">
            <div className="sound-prompt-icon" aria-hidden="true">🔊</div>
            <p className="eyebrow">ALERTAS OPERACIONAIS</p>
            <h2 id="sound-prompt-title">Ativar notificações sonoras?</h2>
            <p>O painel emitirá sons diferentes quando houver veículo atrasado para chegar ao CDC ou motorista aguardando romaneio por mais de 10 minutos.</p>
            <button className="sound-prompt-enable" onClick={enableSounds}>Ativar som</button>
            <button className="sound-prompt-later" onClick={() => setSoundPromptOpen(false)}>Agora não</button>
            <small>Você poderá ativar depois pelo botão no topo do painel.</small>
          </section>
        </div>
      ) : null}
      {testMode && waveOpen ? (
        <div className="wave-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wave-modal-title" onClick={(event) => event.target === event.currentTarget && setWaveOpen(false)}>
          <section className="wave-modal">
            <button className="wave-modal-close" onClick={() => setWaveOpen(false)} aria-label="Fechar gráfico"><X size={20} /></button>
            <p className="eyebrow">JANELA OPERACIONAL COMPLETA</p>
            <h2 id="wave-modal-title">Movimento de chegadas • 22h às 6h</h2>
            <p className="wave-modal-description">Comparativo por hora entre os veículos programados e os registros de chegada ao CDC.</p>
            <div className="wave-modal-legend"><span><i className="planned" /> Programados</span><span><i className="arrived" /> Chegaram</span></div>
            <div className="wave-modal-chart">
              <svg viewBox="0 0 720 230" preserveAspectRatio="none">
                {[45, 93, 142, 190].map((y) => <line key={y} x1="45" y1={y} x2="675" y2={y} />)}
                <polyline className="wave-planned" points={arrivalWave.fullPlanned} />
                <polyline className="wave-arrived" points={arrivalWave.fullArrived} />
                {arrivalWave.values.map((item, index) => {
                  const x = 45 + (index / (arrivalWave.values.length - 1)) * 630;
                  const plannedY = 190 - (item.planned / arrivalWave.max) * 145;
                  const arrivedY = 190 - (item.arrived / arrivalWave.max) * 145;
                  return (
                    <g key={item.hour}>
                      <circle className="planned-point" cx={x} cy={plannedY} r="5" />
                      <circle className="arrived-point" cx={x} cy={arrivedY} r="5" />
                      <text x={x} y="216" textAnchor="middle">{String(item.hour).padStart(2, "0")}h</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="wave-hour-summary">
              {arrivalWave.values.map((item) => (
                <div key={item.hour}><b>{String(item.hour).padStart(2, "0")}h</b><span>{item.arrived}/{item.planned}</span><small>chegaram</small></div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {testMode && delayModalLevel ? (
        <div className="delay-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delay-modal-title" onClick={(event) => event.target === event.currentTarget && setDelayModalLevel(null)}>
          <section className="delay-modal">
            <button className="delay-modal-close" onClick={() => setDelayModalLevel(null)} aria-label="Fechar lista"><X size={20} /></button>
            <p className="eyebrow">CRITICIDADE DE CHEGADA</p>
            <h2 id="delay-modal-title">{delayModalLevel === "all" ? "Todos os veículos atrasados" : `Veículos com atraso • Nível ${delayModalLevel}`}</h2>
            <p className="delay-modal-description">Atrasos calculados pelo horário programado de chegada ao CDC.</p>
            <div className="delay-vehicle-list">
              {arrivalCriticalRows
                .filter((item) => delayModalLevel === "all" || item.level === delayModalLevel)
                .map((item) => (
                  <article key={`${item.date}-${item.plate}`} className={`delay-vehicle-row level-${item.level}`}>
                    <div className="delay-vehicle-plate"><span>PLACA</span><b>{item.plate}</b></div>
                    <div><span>ROTA</span><b>{item.route || "Não informada"}</b></div>
                    <div><span>TRANSPORTADORA</span><b>{item.carrier || "Não informada"}</b></div>
                    <div><span>CHEGADA PROGRAMADA</span><b>{item.time}</b></div>
                    <div className="delay-vehicle-minutes"><span>ATRASO</span><b>{item.lateMinutes} min</b><small>Nível {item.level}</small></div>
                  </article>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function DriverPortal() {
  const params = new URLSearchParams(locationSearch());
  const queryPlate = params
    .get("placa")
    ?.replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 7)
    .toUpperCase();
  const [storedSession] = useState(savedDriverSession);
  const [plate, setPlate] = useState(
    queryPlate || storedSession.plate || "",
  );
  const [route, setRoute] = useState(
    !queryPlate || queryPlate === storedSession.plate
      ? storedSession.route || ""
      : "",
  );
  const [programmed, setProgrammed] = useState(null);
  const [record, setRecord] = useState(null);
  const [dock, setDock] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!programmed || !db) return;
    return onSnapshot(doc(db, "presencas", programmed.plate), (snap) => {
      const current = snap.exists() ? snap.data() : null;
      setRecord(current?.programDate === programmed.date ? current : null);
      if (current?.programDate === programmed.date && current.dockId)
        setDock(current.dockId);
    });
  }, [programmed]);

  const identify = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const normalized = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const snap = await getDoc(doc(db, "configuracoes", "programacao"));
      const link = snap.exists()
        ? snap.data().link || ""
        : localStorage.getItem(SCHEDULE_LINK_KEY) || "";
      const vehicle = await findProgrammedVehicle(link, normalized);
      if (!vehicle)
        throw new Error("Placa não encontrada na programação vigente.");
      setPlate(normalized);
      setRoute(vehicle.route || route);
      setProgrammed(vehicle);
      try {
        localStorage.setItem(
          DRIVER_SESSION_KEY,
          JSON.stringify({
            plate: normalized,
            route: vehicle.route || route,
          }),
        );
      } catch {
        // O registro operacional continua mesmo se o navegador bloquear o armazenamento local.
      }
    } catch (e) {
      setError(e?.message || "Não foi possível consultar a programação.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      storedSession.plate?.length === 7 &&
      storedSession.route?.trim().length >= 2 &&
      (!queryPlate || queryPlate === storedSession.plate)
    )
      identify();
  }, []);

  const changePlate = () => {
    try {
      localStorage.removeItem(DRIVER_SESSION_KEY);
    } catch {
      // Alguns navegadores podem bloquear o armazenamento local.
    }
    if (typeof window !== "undefined" && window.location.search)
      window.history.replaceState({}, "", "/motorista");
    setPlate("");
    setRoute("");
    setProgrammed(null);
    setRecord(null);
    setDock("");
    setError("");
    setMessage("");
  };

  const updateStage = async (stage, value) => {
    setError("");
    setMessage("");
    if (stage.key === "patio" && value === stage.complete && !dock) {
      setError("Selecione a doca antes de confirmar o endocamento.");
      return;
    }
    setSaving(true);
    try {
      const stageIndex = driverStages.findIndex((item) => item.key === stage.key);
      const presenceRef = doc(db, "presencas", programmed.plate);
      const movementRef = doc(collection(db, "movimentacoes"));
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(presenceRef);
        const existing = snapshot.exists() ? snapshot.data() : null;
        const current = existing?.programDate === programmed.date ? existing : null;
        if (stageIndex > 0) {
          const previous = driverStages[stageIndex - 1];
          if (stageValue(current, previous.key) !== previous.complete)
            throw new Error(`Conclua ${previous.label.toLowerCase()} antes desta etapa.`);
        }
        if (current?.progress?.[stage.key]?.value === value)
          throw new Error("Essa opção já está registrada para o veículo.");

        const progress = Object.fromEntries(
          driverStages.slice(stageIndex + 1).map((item) => [item.key, null]),
        );
        progress[stage.key] = { value, at: serverTimestamp() };
        const reset = Object.fromEntries(
          driverStages
            .slice(stageIndex + 1)
            .map((item) => [item.timestamp, null]),
        );
        if (stageIndex === 0 && !current) {
          reset.dockedAt = null;
          reset.cargoFinishedAt = null;
          reset.documentationReceivedAt = null;
          reset.releasedAt = null;
        }
        const statuses = {
          chegadaCdc: "Aguardando",
          patio: value === "endocado" ? "Endocado" : "Aguardando",
          carregamento:
            value === "finalizado" ? "Aguardando documentação" : "Endocado",
          romaneio:
            value === "romaneio recebido"
              ? "Aguardando liberação de saída"
              : "Aguardando documentação",
          saida:
            value === "saída liberada"
              ? "Veículo liberado"
              : "Aguardando liberação de saída",
        };
        const locations = {
          chegadaCdc: `Chegada no CDC — ${value}`,
          patio: value === "endocado" ? `Endocado — Doca ${dock}` : "Pátio — aguardando doca",
          carregamento:
            value === "finalizado"
              ? `Doca ${current?.dockId || dock} — aguardando romaneio`
              : `Doca ${current?.dockId || dock} — aguardando carregamento`,
          romaneio:
            value === "romaneio recebido"
              ? "Romaneio recebido — aguardando liberação de saída"
              : "Aguardando romaneio",
          saida:
            value === "saída liberada"
              ? "Saída liberada"
              : "Aguardando liberação de saída",
        };
        const payload = {
          plate: programmed.plate,
          route: (programmed.route || route).toUpperCase(),
          programDate: programmed.date,
          status: statuses[stage.key],
          location: locations[stage.key],
          dockId:
            stage.key === "saida" && value === "saída liberada"
              ? null
              : stage.key === "patio"
                ? value === "endocado"
                  ? dock
                  : null
                : stage.key === "chegadaCdc"
                  ? null
                  : current?.dockId || dock || null,
          ...reset,
          ...(stage.key === "chegadaCdc"
            ? { arrivalAt: current?.arrivalAt || serverTimestamp() }
            : value === stage.complete
              ? { [stage.timestamp]: serverTimestamp() }
              : { [stage.timestamp]: null }),
          ...(stage.key === "chegadaCdc" ? { manualRelease: false } : {}),
          progress,
          updatedAt: serverTimestamp(),
        };
        transaction.set(presenceRef, payload, { merge: true });
        transaction.set(movementRef, {
          plate: programmed.plate,
          route: payload.route,
          programDate: programmed.date,
          stage: stage.label,
          value,
          event: "ATUALIZACAO_ETAPA_MOTORISTA",
          createdAt: serverTimestamp(),
        });
      });
      setMessage(`${stage.label}: ${value}. Registro atualizado no painel.`);
    } catch (e) {
      setError(e?.message || "Não foi possível atualizar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const activeStageIndex = driverStages.findIndex(
    (stage) => stageValue(record, stage.key) !== stage.complete,
  );
  const activeStage = driverStages[activeStageIndex];
  const activeValue = activeStage ? stageValue(record, activeStage.key) : null;
  const stageHelp = activeStage ? driverStageHelp[activeStage.key] : null;

  return (
    <div className="scan-page driver-page">
      <div className="scan-card driver-card">
        <div className="scan-brand">
          <span><CarFront /></span>
          <b>Controle de Pátio</b>
        </div>
        <p className="eyebrow">REGISTRO DO MOTORISTA</p>
        <h1>{programmed ? "Informe sua situação" : "Informe sua placa"}</h1>
        <p className="scan-help">
          {programmed
            ? "Toque na opção que corresponde ao momento atual da operação."
            : "Com o veículo parado, digite a placa e a rota para começar."}
        </p>
        {!programmed ? (
          <div className="driver-entry">
            <label>Placa do veículo</label>
            <input
              className="plate-input"
              maxLength="7"
              value={plate}
              onChange={(e) => setPlate(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
              placeholder="ABC1D23"
            />
            <label>Rota</label>
            <input
              className="route-input"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="Informe a rota"
            />
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="primary full"
              disabled={plate.length !== 7 || route.trim().length < 2 || loading}
              onClick={identify}
            >
              {loading ? "Consultando..." : "Começar"}
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="driver-identification">
              <strong>{programmed.plate}</strong>
              <span>{programmed.route || route} • Programação {programmed.date}</span>
              <button onClick={changePlate}>
                Trocar placa
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="driver-message">{message}</p> : null}
            {activeStage ? (
              <section className="driver-stage driver-current-stage" aria-live="polite">
                <div className="driver-step-count">ETAPA {activeStageIndex + 1} DE {driverStages.length}</div>
                <div className="driver-step-track"><span style={{ width: `${(activeStageIndex / driverStages.length) * 100}%` }} /></div>
                <h2>{stageHelp.question}</h2>
                <p className="driver-step-hint">{stageHelp.hint}</p>
                {activeValue ? <p className="driver-current-value">Registrado: {activeValue}</p> : null}
                {activeStage.key === "patio" ? (
                  <label className="driver-dock-label">
                    Número da doca, se já estiver nela
                    <select value={dock} onChange={(e) => setDock(e.target.value)}>
                      <option value="">Selecione a doca</option>
                      {driverDockOptions.map((dockId) => (
                        <option key={dockId} value={dockId}>{dockId}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="driver-stage-options">
                  <button
                    className={activeValue === activeStage.waiting ? "selected" : ""}
                    aria-pressed={activeValue === activeStage.waiting}
                    disabled={saving || activeValue === activeStage.waiting}
                    onClick={() => updateStage(activeStage, activeStage.waiting)}
                  >
                    {stageHelp.waiting}
                  </button>
                  <button
                    className="driver-complete-option"
                    disabled={saving}
                    onClick={() => updateStage(activeStage, activeStage.complete)}
                  >
                    {stageHelp.complete}
                  </button>
                </div>
              </section>
            ) : (
              <div className="driver-finished">
                <CircleCheck size={38} />
                <h2>Operação finalizada</h2>
                <p>Sua saída foi registrada. Não é preciso fazer mais nada.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Scan() {
  const [plate, setPlate] = useState(
    () =>
      new URLSearchParams(locationSearch())
        .get("placa")
        ?.replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 7) || "",
  );
  const [route, setRoute] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finishPending, setFinishPending] = useState(false);
  const [documentationPending, setDocumentationPending] = useState(false);
  const [verifiedProgramDate, setVerifiedProgramDate] = useState("");
  const [resultLabel, setResultLabel] = useState("");
  const params = new URLSearchParams(locationSearch());
  const arrivalLink = params.get("chegada") === "cdc";
  const documentationLink = params.get("documentacao") === "cdc";
  const location = arrivalLink
    ? "Portaria"
    : params.get("local") || "Próximo da Doca 52";
  const dockId = params.get("doca");
  const isArrival = location === "Portaria";
  const eventName = isArrival
    ? "Chegada no CDC"
    : dockId
      ? `Doca ${dockId}`
      : location;
  const writeMovement = async (normalized, payload, event) => {
    await setDoc(doc(db, "presencas", normalized), payload, { merge: true });
    await addDoc(collection(db, "movimentacoes"), {
      ...payload,
      event,
      createdAt: serverTimestamp(),
    });
  };
  const confirm = async () => {
    if (!firebaseReady || !db) {
      setError("A conexão com o sistema não está configurada.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const normalized = plate.toUpperCase();
      const scheduleSnap = await getDoc(
        doc(db, "configuracoes", "programacao"),
      );
      const scheduleLink = scheduleSnap.exists()
        ? scheduleSnap.data().link || ""
        : localStorage.getItem(SCHEDULE_LINK_KEY) || "";
      const programmed = await findProgrammedVehicle(scheduleLink, normalized);
      if (!programmed)
        throw new Error(
          "Placa não encontrada na programação vigente. Confira a placa informada.",
        );
      const effectiveRoute = (programmed.route || route).toUpperCase();
      setRoute(effectiveRoute);
      const presenceRef = doc(db, "presencas", normalized);
      const currentSnap = await getDoc(presenceRef);
      const current = currentSnap.exists() ? currentSnap.data() : null;
      if (documentationLink) {
        if (
          current?.programDate !== programmed.date ||
          current.status !== "Aguardando documentação"
        ) {
          throw new Error(
            current?.status === "Veículo liberado" ||
            current?.status === "Aguardando liberação de saída"
              ? "O romaneio deste veículo já foi confirmado."
              : "Este veículo ainda não está aguardando documentação. Finalize a carga ou descarga na doca antes de confirmar o romaneio.",
          );
        }
        setRoute(current.route || effectiveRoute);
        setVerifiedProgramDate(programmed.date);
        setDocumentationPending(true);
        return;
      }
      if (isArrival && current?.programDate === programmed.date) {
        if (
          current.arrivalAt ||
          current.status === "Endocado" ||
          current.status === "Aguardando documentação" ||
          current.status === "Aguardando liberação de saída" ||
          current.status === "Veículo liberado"
        ) {
          setError(
            "A chegada deste veículo já foi registrada nesta programação. Confira o painel antes de tentar novamente.",
          );
          return;
        }
      }
      if (
        dockId &&
        current?.status === "Endocado" &&
        current?.dockId === dockId &&
        current?.programDate === programmed.date
      ) {
        setFinishPending(true);
        return;
      }
      if (
        current?.programDate === programmed.date &&
        current?.status === "Aguardando documentação"
      ) {
        if (dockId && current.dockId === dockId) {
          setVerifiedProgramDate(programmed.date);
          setDocumentationPending(true);
          return;
        }
        throw new Error(
          "Este veículo aguarda o romaneio. Confirme o recebimento pelo link de documentação.",
        );
      }
      if (
        current?.programDate === programmed.date &&
        current?.status === "Veículo liberado"
      ) {
        throw new Error("Este veículo já foi liberado nesta programação.");
      }
      if (
        current?.programDate === programmed.date &&
        current?.status === "Aguardando liberação de saída"
      ) {
        throw new Error("O romaneio foi recebido. Registre a saída no link do motorista.");
      }
      const status = dockId ? "Endocado" : "Aguardando";
      const stageTime = isArrival
        ? { arrivalAt: serverTimestamp() }
        : dockId
          ? { dockedAt: serverTimestamp() }
          : {};
      const label = isArrival
        ? "Chegada no CDC"
        : dockId
          ? `Endocado — Doca ${dockId}`
          : location;
      const payload = {
        plate: normalized,
        route: effectiveRoute,
        location: label,
        status,
        dockId: dockId || null,
        programDate: programmed.date,
        ...(current?.programDate !== programmed.date
          ? {
              arrivalAt: null,
              dockedAt: null,
              cargoFinishedAt: null,
              documentationReceivedAt: null,
              releasedAt: null,
              manualRelease: false,
            }
          : {}),
        progress: {
          ...(current?.programDate !== programmed.date
            ? Object.fromEntries(driverStages.map((stage) => [stage.key, null]))
            : {}),
          ...(isArrival
            ? { chegadaCdc: { value: "liberada", at: serverTimestamp() } }
            : dockId
              ? {
                  patio: { value: "endocado", at: serverTimestamp() },
                  carregamento: {
                    value: "aguardando carregamento",
                    at: serverTimestamp(),
                  },
                }
              : {
                  patio: { value: "aguardando doca", at: serverTimestamp() },
                }),
        },
        ...stageTime,
        updatedAt: serverTimestamp(),
      };
      await writeMovement(
        normalized,
        payload,
        isArrival
          ? "CHEGADA_NO_CDC"
          : dockId
            ? "ENDOCADO"
            : "LOCALIZACAO_PATIO",
      );
      setResultLabel(label);
      setDone(true);
    } catch (e) {
      setError(
        e?.code === "permission-denied"
          ? "O banco de dados ainda não autorizou este registro. Verifique as regras do Firebase."
          : e?.message ||
              "Não foi possível registrar. Confira sua conexão e tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };
  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      const normalized = plate.toUpperCase();
      const snap = await getDoc(doc(db, "presencas", normalized));
      if (snap.data()?.status !== "Endocado" || snap.data()?.dockId !== dockId) {
        throw new Error(
          "O veículo não está mais endocado nesta posição. Atualize a página.",
        );
      }
      const payload = {
        plate: normalized,
        route: route.toUpperCase(),
        status: "Aguardando documentação",
        location: `Doca ${dockId} — aguardando romaneio`,
        dockId,
        cargoFinishedAt: serverTimestamp(),
        progress: {
          carregamento: { value: "finalizado", at: serverTimestamp() },
          romaneio: { value: "aguardando romaneio", at: serverTimestamp() },
        },
        updatedAt: serverTimestamp(),
      };
      await writeMovement(normalized, payload, "AGUARDANDO_DOCUMENTACAO");
      setResultLabel("Carga/descarga finalizada — Aguardando documentação");
      setFinishPending(false);
      setDone(true);
    } catch (e) {
      setError(
        e?.code === "permission-denied"
          ? "O banco de dados ainda não autorizou este registro. Verifique as regras do Firebase."
          : e?.message ||
              "Não foi possível finalizar. Confira sua conexão e tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };
  const confirmDocumentation = async () => {
    setSaving(true);
    setError("");
    try {
      const normalized = plate.toUpperCase();
      const presenceRef = doc(db, "presencas", normalized);
      const snap = await getDoc(presenceRef);
      const current = snap.exists() ? snap.data() : null;
      if (
        current?.status !== "Aguardando documentação" ||
        current.programDate !== verifiedProgramDate
      ) {
        throw new Error(
          "Este veículo não está aguardando documentação. Atualize a página e confira o status.",
        );
      }
      const payload = {
        plate: normalized,
        route: current.route,
        status: "Aguardando liberação de saída",
        location: "Romaneio recebido — aguardando liberação de saída",
        dockId: current.dockId || null,
        documentationReceivedAt: serverTimestamp(),
        progress: {
          romaneio: { value: "romaneio recebido", at: serverTimestamp() },
          saida: { value: "aguardando liberação", at: serverTimestamp() },
        },
        updatedAt: serverTimestamp(),
      };
      await writeMovement(normalized, payload, "DOCUMENTACAO_RECEBIDA");
      setRoute(current.route);
      setResultLabel("Romaneio recebido — Aguardando liberação de saída");
      setDocumentationPending(false);
      setDone(true);
    } catch (e) {
      setError(
        e?.message || "Não foi possível confirmar o romaneio. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="scan-page">
      <div className="scan-card">
        <div className="scan-brand">
          <span>
            {arrivalLink || documentationLink ? <CarFront /> : <QrCode />}
          </span>
          <b>Controle de Pátio</b>
        </div>
        {done ? (
          <div className="success">
            <div className="success-icon">
              <CircleCheck size={42} />
            </div>
            <p className="eyebrow">REGISTRO CONFIRMADO</p>
            <h1>
              {resultLabel.includes("liberado")
                ? "Veículo liberado!"
                : resultLabel.includes("Aguardando documentação")
                  ? "Aguardando romaneio"
                : "Registro realizado!"}
            </h1>
            <p>
              {resultLabel.includes("liberado")
                ? "A saída foi liberada e registrada no painel."
                : resultLabel.includes("Romaneio recebido")
                  ? "O recebimento foi registrado. Aguarde a liberação da saída no link do motorista."
                : resultLabel.includes("Aguardando documentação")
                  ? "A carga ou descarga terminou. Confirme o recebimento do romaneio antes de sair."
                  : "Sua localização foi enviada ao controle operacional."}
            </p>
            <div className="receipt">
              <span>
                Placa<b>{plate.toUpperCase()}</b>
              </span>
              <span>
                Rota<b>{route.toUpperCase()}</b>
              </span>
              <span>
                Registro<b>{resultLabel}</b>
              </span>
              <span>
                Horário
                <b>
                  {new Date().toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
              </span>
            </div>
            {resultLabel.includes("Aguardando documentação") ? (
              <a
                className="primary full documentation-link"
                href={`/motorista?placa=${encodeURIComponent(plate.toUpperCase())}`}
              >
                Atualizar romaneio e saída
              </a>
            ) : null}
            {resultLabel.includes("Romaneio recebido") ? (
              <a
                className="primary full documentation-link"
                href={`/motorista?placa=${encodeURIComponent(plate.toUpperCase())}`}
              >
                Acompanhar liberação da saída
              </a>
            ) : null}
            <small className="safe">Registro concluído. Você pode fechar esta página.</small>
          </div>
        ) : documentationPending ? (
          <div className="success">
            <p className="eyebrow">CONFIRMAÇÃO DO ROMANEIO</p>
            <h1>Recebeu a documentação?</h1>
            <p>
              Confirme somente se o romaneio da placa <b>{plate.toUpperCase()}</b> foi entregue a você.
              O horário ficará registrado no painel. Depois, acompanhe a etapa de saída pelo link do motorista.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <button disabled={saving} className="primary full" onClick={confirmDocumentation}>
              {saving ? "Registrando..." : "Confirmar recebimento do romaneio"}{" "}
              <CircleCheck size={18} />
            </button>
            <button disabled={saving} className="secondary full" onClick={() => setDocumentationPending(false)}>
              Voltar
            </button>
          </div>
        ) : finishPending ? (
          <div className="success">
            <p className="eyebrow">FINALIZAÇÃO DA OPERAÇÃO</p>
            <h1>Finalizar carga/descarga?</h1>
            <p>
              O veículo <b>{plate.toUpperCase()}</b> já está registrado na Doca{" "}
              {dockId}. Confirme somente se a operação terminou. O painel passará
              a mostrar que o veículo aguarda o romaneio.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <button disabled={saving} className="primary full" onClick={finish}>
              {saving ? "Finalizando..." : "Finalizar carga/descarga"}{" "}
              <CircleCheck size={18} />
            </button>
            <button
              disabled={saving}
              className="secondary full"
              onClick={() => setFinishPending(false)}
            >
              Voltar
            </button>
          </div>
        ) : (
          <>
            <p className="eyebrow">
              {documentationLink
                ? "RECEBIMENTO DO ROMANEIO"
                : arrivalLink
                  ? "REGISTRO DE CHEGADA"
                  : "CONFIRMAÇÃO DE LOCALIZAÇÃO"}
            </p>
            <h1>
              {documentationLink ? (
                <>
                  Recebeu o <em>romaneio?</em>
                </>
              ) : arrivalLink ? (
                <>
                  Chegou ao <em>CDC?</em>
                </>
              ) : (
                <>
                  Você está em
                  <br />
                  <em>{eventName}</em>
                </>
              )}
            </h1>
            <p className="scan-help">
              {documentationLink
                ? "Com o veículo parado, informe sua placa para consultar a operação e confirmar que recebeu a documentação."
                : arrivalLink
                ? "Com o veículo parado na entrada, informe a placa e a rota para registrar sua chegada no CDC."
                : "Informe somente a placa e a rota para confirmar sua localização."}
            </p>
            <label>Placa do veículo</label>
            <input
              className="plate-input"
              maxLength="7"
              value={plate}
              onChange={(e) =>
                setPlate(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))
              }
              placeholder="ABC1D23"
            />
            {!documentationLink ? (
              <>
                <label>Rota</label>
                <input
                  className="route-input"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="Informe a rota"
                />
              </>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            <button
              disabled={plate.length < 7 || (!documentationLink && !route.trim()) || saving}
              className="primary full"
              onClick={confirm}
            >
              {saving
                ? "Verificando..."
                : documentationLink
                  ? "Consultar romaneio"
                  : arrivalLink
                  ? "Registrar chegada no CDC"
                  : "Confirmar localização"}{" "}
              <ChevronRight size={18} />
            </button>
            <small className="safe">
              {documentationLink
                ? "A confirmação registra o recebimento do romaneio. A saída é uma etapa separada."
                : arrivalLink
                ? "Use este link somente ao chegar ao CDC. Depois, siga as orientações de localização no pátio e na doca."
                : "Na segunda leitura da mesma doca, finalize a operação e aguarde o romaneio."}
            </small>
          </>
        )}
      </div>
    </div>
  );
}
function locationSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function locationPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function App() {
  const testMode = locationPathname().replace(/\/+$/, "") === "/teste";
  const [screen] = useState(() => {
    const params = new URLSearchParams(locationSearch());
    if (
      locationPathname().replace(/\/+$/, "") === "/motorista" ||
      params.get("motorista") === "cdc" ||
      params.get("chegada") === "cdc"
    )
      return "driver";
    if (params.has("local") || params.get("documentacao") === "cdc")
      return "scan";
    return "admin";
  });
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    if (!firebaseReady || !auth) {
      setAuthError("A conexão com o Firebase não está configurada.");
      return;
    }
    let signingIn = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
        setAuthError("");
        return;
      }
      if (signingIn) return;
      signingIn = true;
      signInAnonymously(auth)
        .catch((error) => {
          console.error("Falha na autenticação anônima:", error);
          setAuthError(
            "Não foi possível conectar ao sistema. Atualize a página e tente novamente.",
          );
        })
        .finally(() => {
          signingIn = false;
        });
    });
    return unsubscribe;
  }, []);
  if (!authReady)
    return (
      <div className="scan-page">
        <div className="scan-card">
          <div className="scan-brand">
            <span>
              <CarFront />
            </span>
            <b>Controle de Pátio</b>
          </div>
          {authError ? (
            <>
              <p className="eyebrow">CONEXÃO INDISPONÍVEL</p>
              <h1>Não foi possível iniciar</h1>
              <p className="form-error">{authError}</p>
            </>
          ) : (
            <>
              <p className="eyebrow">CONECTANDO</p>
              <h1>Aguarde um instante...</h1>
              <p className="scan-help">Preparando o controle operacional.</p>
            </>
          )}
        </div>
      </div>
    );
  return screen === "driver" ? (
    <DriverPortal />
  ) : screen === "scan" ? (
    <Scan />
  ) : (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brandmark">
            <CarFront />
          </div>
          <div>
            <b>Controle de Pátio</b>
            <span>GU - GUARULHOS</span>
          </div>
        </div>
        <span className="app-header-company">iMile • Controle operacional</span>
      </header>
      <main>
        <Dashboard testMode={testMode} />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
