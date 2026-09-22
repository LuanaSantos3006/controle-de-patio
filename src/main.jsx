import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CarFront,
  Clock3,
  Container,
  LayoutDashboard,
  MapPin,
  QrCode,
  Search,
  Truck,
  Users,
  BarChart3,
  Menu,
  X,
  LogOut,
  ChevronRight,
  CircleCheck,
  AlertTriangle,
  Maximize2,
  Download,
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

const nav = [
  ["Visão geral", LayoutDashboard],
  ["Relatórios", BarChart3],
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
  return (
    <article className="stat">
      <div className={`stat-icon ${tone}`}>
        <Icon size={21} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
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
function FlowChart({ arrivals, releases }) {
  const max = Math.max(...arrivals, ...releases, 1);
  const points = (values) =>
    values
      .map((value, index) => `${8 + index * 11.5},${86 - (value / max) * 70}`)
      .join(" ");
  return (
    <div className="flow-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="8" y1="86" x2="100" y2="86" />
        <line x1="8" y1="51" x2="100" y2="51" />
        <line x1="8" y1="16" x2="100" y2="16" />
        <polyline className="arrival-line" points={points(arrivals)} />
        <polyline className="release-line" points={points(releases)} />
      </svg>
      <div className="flow-labels">
        {["22h", "23h", "00h", "01h", "02h", "03h", "04h", "05h", "06h"].map(
          (label) => (
            <span key={label}>{label}</span>
          ),
        )}
      </div>
    </div>
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
  return registeredAt
    ? Math.max(0, Math.floor((currentTime - registeredAt) / 60000))
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
  const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) throw new Error("Cole um link válido do Google Planilhas.");
  const gid =
    new URL(link).searchParams.get("gid") ||
    link.match(/gid=(\d+)/)?.[1] ||
    "0";
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
};
const programDateKey = (dateValue) => {
  const parts = (dateValue || "")
    .trim()
    .match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (!parts) return null;
  const year = parts[3]
    ? Number(parts[3]) < 100
      ? 2000 + Number(parts[3])
      : Number(parts[3])
    : new Date().getFullYear();
  return new Date(year, Number(parts[2]) - 1, Number(parts[1])).getTime();
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

function DockMap({ liveDocks, expanded, onExpand, onClose }) {
  const available = 17 - Object.keys(liveDocks).length;
  return (
    <section className={`panel dock-panel ${expanded ? "dock-modal" : ""}`}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">SP8 • GUARULHOS • TEMPO REAL</p>
          <h2>Mapa operacional das docas</h2>
          <p>18 posições físicas • clique para visualizar o mapa completo</p>
        </div>
        <div className="dock-actions">
          <span className="dock-count">{available} disponíveis</span>
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
      <div className="dock-grid">
        {docks.map((d) => {
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
              <div className="dock-bases">
                {d.bases.map((base, index) => (
                  <span key={`${base}-${index}`}>{base}</span>
                ))}
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
      </div>
      <div className="conveyor">
        <span>Esteira / Conveyor</span>
      </div>
    </section>
  );
}

function Dashboard({ onScan, activeNav }) {
  const [query, setQuery] = useState("");
  const [driverRecords, setDriverRecords] = useState(
    firebaseReady ? [] : initialDrivers,
  );
  const [turnStartedAt, setTurnStartedAt] = useState(null);
  const [closedProgramDate, setClosedProgramDate] = useState("");
  const [closingTurn, setClosingTurn] = useState(false);
  const [turnMessage, setTurnMessage] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [scheduleLink, setScheduleLink] = useState(() =>
    typeof window === "undefined"
      ? ""
      : localStorage.getItem(SCHEDULE_LINK_KEY) || "",
  );
  const [scheduleRows, setScheduleRows] = useState([]);
  const [scheduleReferenceDate, setScheduleReferenceDate] = useState("");
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [manualReleasePlate, setManualReleasePlate] = useState("");
  const [manualReleaseError, setManualReleaseError] = useState("");
  const [now, setNow] = useState(Date.now());
  const pageCopy = {
    "Visão geral": [
      "Visão geral do pátio",
      "Acompanhe toda a operação em tempo real em um único painel.",
    ],
    Relatórios: [
      "Relatório de encerramento do turno",
      "Confira a pontualidade das saídas e baixe o fechamento da operação.",
    ],
  }[activeNav] || [
    "Visão geral do pátio",
    "Acompanhe a operação em tempo real.",
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
    return onSnapshot(doc(db, "configuracoes", "programacao"), (snap) => {
      if (snap.exists()) {
        const savedLink = snap.data().link || "";
        setScheduleLink(savedLink);
        localStorage.setItem(SCHEDULE_LINK_KEY, savedLink);
      }
    });
  }, []);
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
  const filtered = useMemo(
    () => {
      const rows = scheduleRows.length
        ? scheduleRows.map((item) => {
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
              registered: Boolean(record),
            };
          })
        : allDrivers.map((driver) => ({ ...driver, registered: true }));
      return rows.filter((driver) =>
        `${driver.plate || ""} ${driver.name || ""} ${driver.route || ""} ${driver.location || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    },
    [query, scheduleRows, allDrivers],
  );
  const liveDocks = useMemo(
    () =>
      Object.fromEntries(
        activeDrivers
          .filter(
            (d) =>
              (d.status === "Endocado" ||
                d.status === "Aguardando documentação" ||
                d.status === "Aguardando liberação de saída") &&
              d.dockId,
          )
          .map((d) => [d.dockId, d]),
      ),
    [activeDrivers],
  );
  const waiting = activeDrivers.filter((d) => d.status === "Aguardando").length;
  const documentationWaiting = activeDrivers.filter(
    (d) => d.status === "Aguardando documentação",
  );
  const documentationReceived = allDrivers
    .filter(
      (d) =>
        d.documentationReceivedAt &&
        (!turnStartedAt ||
          timestampMillis(d.documentationReceivedAt) >= turnStartedAt) &&
        (!scheduleReferenceDate || d.programDate === scheduleReferenceDate),
    )
    .sort(
      (a, b) =>
        (timestampMillis(b.documentationReceivedAt) || 0) -
        (timestampMillis(a.documentationReceivedAt) || 0),
    );
  const [stageQuery, setStageQuery] = useState("");
  const stageRows = useMemo(() => {
    const rows = scheduleRows.length
      ? scheduleRows.map((item) => ({
          plate: item.plate,
          route: item.route,
          record: allDrivers.find(
            (driver) =>
              driver.plate === item.plate && driver.programDate === item.date,
          ),
        }))
      : allDrivers.map((driver) => ({
          plate: driver.plate,
          route: driver.route,
          record: driver,
        }));
    return rows.filter((item) =>
      item.plate.includes(stageQuery.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()),
    );
  }, [scheduleRows, allDrivers, stageQuery]);
  const docked = activeDrivers.filter((d) => d.status === "Endocado").length;
  const released = allDrivers.filter(
    (d) => d.status === "Veículo liberado",
  ).length;
  const availableDocks = docks.filter((d) => !d.blocked && !liveDocks[d.id]);
  const departureAlerts = useMemo(
    () =>
      scheduleReferenceDate && closedProgramDate === scheduleReferenceDate
        ? []
        : scheduleRows
            .map((item) => {
              const record = allDrivers.find((d) => d.plate === item.plate);
              if (
                record?.status === "Endocado" ||
                record?.status === "Aguardando documentação" ||
                record?.status === "Aguardando liberação de saída" ||
                record?.status === "Veículo liberado"
              )
                return null;
              const driver = activeDrivers.find((d) => d.plate === item.plate);
              const departure = scheduleDate(item.date, item.time);
              if (!departure) return null;
              const minutes = Math.ceil((departure.getTime() - now) / 60000);
              return { ...item, driver, minutes, departure };
            })
            .filter((item) => item && item.departure.getTime() < now)
            .sort((a, b) => a.minutes - b.minutes),
    [
      scheduleRows,
      scheduleReferenceDate,
      closedProgramDate,
      allDrivers,
      activeDrivers,
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
  const departureReport = useMemo(
    () =>
      scheduleRows
        .map((item) => {
          const record = allDrivers.find((d) => d.plate === item.plate);
          const scheduled = scheduleDate(item.date, item.departureTime);
          const actual = record?.releasedAt?.toDate
            ? record.releasedAt.toDate()
            : null;
          if (!scheduled) return null;
          const delay = actual
            ? Math.max(
                0,
                Math.ceil((actual.getTime() - scheduled.getTime()) / 60000),
              )
            : null;
          const status = actual
            ? delay > 0
              ? "Saiu atrasado"
              : "Saiu no horário"
            : !record
              ? "Sem registro no CDC"
              : now > scheduled.getTime()
                ? "Saída pendente e atrasada"
                : "Em operação";
          return { ...item, scheduled, actual, delay, status };
        })
        .filter(Boolean)
        .sort((a, b) => a.scheduled - b.scheduled),
    [scheduleRows, allDrivers, now],
  );
  const reportTotals = useMemo(() => {
    const onTime = departureReport.filter(
        (x) => x.status === "Saiu no horário",
      ).length,
      late = departureReport.filter((x) => x.status === "Saiu atrasado").length;
    return {
      total: departureReport.length,
      onTime,
      late,
      pending: departureReport.length - onTime - late,
    };
  }, [departureReport]);
  const reportSeries = useMemo(() => {
    const cumulative = (predicate) =>
      departureReport.reduce(
        (series, item) => [
          ...series,
          (series.at(-1) || 0) + (predicate(item) ? 1 : 0),
        ],
        [0],
      );
    return {
      total: cumulative(() => true),
      onTime: cumulative((item) => item.status === "Saiu no horário"),
      late: cumulative((item) => item.status === "Saiu atrasado"),
      pending: cumulative(
        (item) =>
          item.status !== "Saiu no horário" && item.status !== "Saiu atrasado",
      ),
    };
  }, [departureReport]);
  const reportDashboard = useMemo(() => {
    const hours = [22, 23, 0, 1, 2, 3, 4, 5, 6],
      hourIndex = (value) => {
        const ms = timestampMillis(value);
        return ms ? hours.indexOf(new Date(ms).getHours()) : -1;
      };
    const arrivals = hours.map(() => 0),
      releases = hours.map(() => 0);
    allDrivers.forEach((driver) => {
      const arrivalIndex = hourIndex(driver.arrivalAt),
        releaseIndex = hourIndex(driver.releasedAt);
      if (arrivalIndex >= 0) arrivals[arrivalIndex]++;
      if (releaseIndex >= 0) releases[releaseIndex]++;
    });
    const routeMap = {};
    departureReport
      .filter((item) => item.delay > 0)
      .forEach((item) => {
        const route = item.route || "Rota não informada";
        routeMap[route] = Math.max(routeMap[route] || 0, item.delay);
      });
    const routes = Object.entries(routeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const stays = allDrivers
      .map((driver) => {
        const start = timestampMillis(driver.arrivalAt);
        const end = timestampMillis(driver.releasedAt) || now;
        return {
          plate: driver.plate,
          minutes: start ? Math.max(0, Math.floor((end - start) / 60000)) : 0,
        };
      })
      .filter((item) => item.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);
    return { arrivals, releases, routes, stays };
  }, [allDrivers, departureReport, now]);
  const downloadReportPng = () => {
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d"),
      W = 1600,
      H = 900;
    canvas.width = W;
    canvas.height = H;
    const navy = "#082574",
      blue = "#0967de",
      cyan = "#1ec1d1",
      textColor = "#0a276f",
      muted = "#5f7194",
      grid = "#cfdae7";
    const box = (x, y, w, h, r = 14, fill = "#fff") => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const label = (value, x, y, size = 14, color = textColor, bold = false) => {
      ctx.fillStyle = color;
      ctx.font = (bold ? "700 " : "400 ") + size + "px Arial";
      ctx.fillText(String(value), x, y);
    };
    ctx.fillStyle = "#eaf6fb";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#07388f";
    ctx.fillRect(0, 0, W, 132);
    ctx.fillStyle = "#0872e8";
    ctx.beginPath();
    ctx.moveTo(0, 98);
    ctx.bezierCurveTo(220, 45, 300, 125, 510, 92);
    ctx.bezierCurveTo(720, 145, 900, 80, 1070, 93);
    ctx.bezierCurveTo(1280, 130, 1430, 62, 1600, 96);
    ctx.lineTo(1600, 132);
    ctx.lineTo(0, 132);
    ctx.fill();
    ctx.fillStyle = cyan;
    ctx.beginPath();
    ctx.moveTo(0, 106);
    ctx.bezierCurveTo(200, 98, 310, 138, 510, 104);
    ctx.bezierCurveTo(710, 148, 930, 92, 1130, 108);
    ctx.bezierCurveTo(1330, 140, 1470, 96, 1600, 109);
    ctx.lineTo(1600, 132);
    ctx.lineTo(0, 132);
    ctx.fill();
    label("DASHBOARD | CONTROLE DE PÁTIO", 55, 55, 32, "#fff", true);
  label("iMile • SP1 E SP8 - GUARULHOS", 1200, 35, 21, "#fff", true);
    label("Data: " + (scheduleReferenceDate || "—"), 1380, 66, 17, "#fff");
    const total = reportTotals.total || 1,
      onPct = Math.round((reportTotals.onTime / total) * 100),
      latePct = Math.round((reportTotals.late / total) * 100),
      pendingPct = Math.round((reportTotals.pending / total) * 100);
    [
      ["VEÍCULOS PROGRAMADOS", reportTotals.total, "Programação vigente", blue],
      ["SAÍRAM NO HORÁRIO", reportTotals.onTime, onPct + "% do total", cyan],
      ["SAÍRAM ATRASADOS", reportTotals.late, latePct + "% do total", cyan],
      ["SAÍDA PENDENTE", reportTotals.pending, pendingPct + "% do total", blue],
    ].forEach((k, i) => {
      const x = 38 + i * 385;
      box(x, 130, 373, 134);
      box(x + 10, 136, 12, 122, 6, k[3]);
      label(k[0], x + 39, 162, 15, muted, true);
      label(k[1], x + 39, 215, 45, textColor, true);
      label(k[2], x + 39, 245, 16, muted);
    });
    box(38, 282, 845, 347);
    label("Fluxo de veículos por horário", 70, 324, 22, textColor, true);
    ctx.fillStyle = blue;
    ctx.beginPath();
    ctx.arc(596, 316, 6, 0, Math.PI * 2);
    ctx.fill();
    label("Chegadas", 610, 320, 13, muted);
    ctx.fillStyle = cyan;
    ctx.beginPath();
    ctx.arc(706, 316, 6, 0, Math.PI * 2);
    ctx.fill();
    label("Liberações", 720, 320, 13, muted);
    const hours = [
        "22h",
        "23h",
        "00h",
        "01h",
        "02h",
        "03h",
        "04h",
        "05h",
        "06h",
      ],
      maxFlow = Math.max(
        ...reportDashboard.arrivals,
        ...reportDashboard.releases,
        1,
      ),
      x0 = 105,
      y0 = 580,
      x1 = 840,
      y1 = 365;
    [0, 0.33, 0.66, 1].forEach((p) => {
      const y = y0 - p * (y0 - y1);
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      label(Math.round(maxFlow * p), 68, y + 4, 12, muted);
    });
    const drawFlow = (values, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = x0 + (i * (x1 - x0)) / 8,
          y = y0 - (v / maxFlow) * (y0 - y1);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      values.forEach((v, i) => {
        const x = x0 + (i * (x1 - x0)) / 8,
          y = y0 - (v / maxFlow) * (y0 - y1);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    drawFlow(reportDashboard.arrivals, blue);
    drawFlow(reportDashboard.releases, cyan);
    hours.forEach((h, i) =>
      label(h, x0 + (i * (x1 - x0)) / 8 - 12, 604, 12, muted),
    );
    box(895, 282, 355, 347);
    label("Atrasos por rota", 930, 324, 22, textColor, true);
    const routeMax = Math.max(
      ...reportDashboard.routes.map((item) => item[1]),
      1,
    );
    reportDashboard.routes.slice(0, 4).forEach((item, i) => {
      const y = 365 + i * 58;
      label(item[0].slice(0, 14), 930, y + 12, 12, muted);
      ctx.fillStyle = blue;
      ctx.fillRect(1045, y - 4, (150 * item[1]) / routeMax, 26);
      label(
        item[1] + " min",
        1053 + (150 * item[1]) / routeMax,
        y + 14,
        12,
        textColor,
        true,
      );
    });
    box(1262, 282, 300, 347);
    label("MAIORES PERMANÊNCIAS", 1295, 317, 16, textColor, true);
    box(1280, 340, 264, 260, 15, "#eef6fb");
    label("Veículos no CDC", 1308, 382, 17, textColor, true);
    reportDashboard.stays.slice(0, 3).forEach((item, i) => {
      const y = 420 + i * 55;
      label(i + 1 + ". " + item.plate, 1308, y, 14, textColor);
      label(formatDuration(item.minutes), 1460, y, 14, blue, true);
    });
    box(38, 647, 510, 201);
    label("COMPOSIÇÃO DAS SAÍDAS", 70, 685, 20, textColor, true);
    const cx = 175,
      cy = 765,
      r = 62;
    ctx.lineWidth = 24;
    ctx.strokeStyle = blue;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      r - 12,
      -Math.PI / 2,
      -Math.PI / 2 + (Math.PI * 2 * reportTotals.onTime) / total,
    );
    ctx.stroke();
    ctx.strokeStyle = "#e94b48";
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      r - 12,
      -Math.PI / 2 + (Math.PI * 2 * reportTotals.onTime) / total,
      -Math.PI / 2 +
        (Math.PI * 2 * (reportTotals.onTime + reportTotals.late)) / total,
    );
    ctx.stroke();
    ctx.strokeStyle = "#f1b83b";
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      r - 12,
      -Math.PI / 2 +
        (Math.PI * 2 * (reportTotals.onTime + reportTotals.late)) / total,
      Math.PI * 1.5,
    );
    ctx.stroke();
    label(onPct + "%", 142, 760, 19, textColor, true);
    label("no horário", 145, 780, 11, muted);
    [
      ["No horário", reportTotals.onTime, blue],
      ["Atrasados", reportTotals.late, "#e94b48"],
      ["Pendentes", reportTotals.pending, "#f1b83b"],
    ].forEach((item, i) => {
      const y = 722 + i * 39;
      ctx.fillStyle = item[2];
      ctx.beginPath();
      ctx.arc(300, y, 8, 0, Math.PI * 2);
      ctx.fill();
      label(item[0], 320, y + 4, 13, muted);
      label(item[1], 470, y + 4, 13, textColor, true);
    });
    box(560, 647, 483, 201);
    label("INSIGHT OPERACIONAL", 594, 685, 20, textColor, true);
    label(reportTotals.late + " veículos", 594, 737, 35, blue, true);
    const lead = reportDashboard.routes[0];
    label(
      reportTotals.late
        ? "saíram após o horário programado."
        : "Não houve saídas atrasadas no turno.",
      594,
      770,
      14,
      muted,
    );
    if (lead) {
      label(
        (
          "A rota " +
          lead[0] +
          " teve o maior atraso: " +
          lead[1] +
          " min."
        ).slice(0, 56),
        594,
        792,
        14,
        muted,
      );
      label(
        "Priorize a liberação das docas com maior desvio.",
        594,
        814,
        14,
        muted,
      );
    }
    box(1055, 647, 507, 201);
    label("FOCO DE TRATATIVA", 1090, 685, 20, textColor, true);
    reportDashboard.routes.slice(0, 3).forEach((item, i) => {
      const y = 724 + i * 42;
      label("0" + (i + 1), 1092, y, 14, cyan, true);
      label(item[0].slice(0, 22), 1140, y, 15, textColor, true);
      label(item[1] + " min", 1442, y, 14, blue, true);
    });
    label("iMile", 48, 893, 29, blue, true);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(135, 881);
    ctx.lineTo(370, 881);
    ctx.stroke();
    label(
      "Fonte: Controle de Pátio • Gerado em " +
        new Date().toLocaleString("pt-BR"),
      1110,
      881,
      12,
      muted,
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        "dashboard-controle-patio-" +
        (scheduleReferenceDate || "programacao").replace(/\//g, "-") +
        ".png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  const saveScheduleLink = async () => {
    setScheduleError("");
    try {
      const savedLink = scheduleLink.trim();
      sheetCsvUrl(savedLink);
      localStorage.setItem(SCHEDULE_LINK_KEY, savedLink);
      await setDoc(
        doc(db, "configuracoes", "programacao"),
        { link: savedLink, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setScheduleLink(savedLink);
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
        "Encerrar o turno agora? O relatório será baixado e o painel será zerado para a próxima operação.",
      )
    )
      return;
    setClosingTurn(true);
    setTurnMessage("");
    try {
      downloadReportPng();
      try {
        await addDoc(collection(db, "turnos"), {
          programDate: scheduleReferenceDate || null,
          vehicles: allDrivers.length,
          waiting,
          docked,
          released,
          report: { ...reportTotals },
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
        <button
          className="close-turn-button"
          onClick={closeTurn}
          disabled={closingTurn}
        >
          <LogOut size={17} />
          {closingTurn ? "Encerrando..." : "Encerrar turno"}
        </button>
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
              value={activeDrivers.length}
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
                        <b>{alertLabel}</b>
                        <span>
                          {item.route || item.driver?.route || "Rota não informada"}
                        </span>
                        <span>Chegada programada: {item.time}</span>
                        <small>
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
        <section className="grid-main">
          <div className="panel live">
            <div className="panel-head">
              <div>
                <h2>Acompanhamento operacional</h2>
                <p>Horários programados e evolução automática pelo link do motorista e pelos QR Codes</p>
              </div>
              <div className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar placa ou motorista"
                />
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
                                <span style={{ width: `${progress.percent}%` }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            {["Endocado", "Aguardando documentação", "Aguardando liberação de saída"].includes(d.status) ? (
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
                              <span className="automatic-note">Automático</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-row">
                        Nenhum veículo na programação vigente
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
                <p>Capacidade operacional</p>
              </div>
            </div>
            <div className="capacity">
              <strong>{activeDrivers.length}</strong>
              <span>veículos no CDC</span>
              <small>Capacidade máxima do pátio a configurar</small>
            </div>
            <div className="legend">
              <p>
                <i className="dot parking" />
                Aguardando <b>{waiting}</b>
              </p>
              <p>
                <i className="dot dock" />
                Em carga/descarga <b>{docked}</b>
              </p>
              <p>
                <i className="dot parking" />
                Aguardando documentação <b>{documentationWaiting.length}</b>
              </p>
              <p>
                <i className="dot moving" />
                Liberados hoje <b>{released}</b>
              </p>
            </div>
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
          <section className="panel stage-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">ETAPAS • TEMPO REAL</p>
                <h2>Situação de cada veículo</h2>
                <p>Os registros do motorista aparecem aqui automaticamente.</p>
              </div>
              <div className="search">
                <Search size={16} />
                <input
                  value={stageQuery}
                  onChange={(e) => setStageQuery(e.target.value)}
                  placeholder="Buscar placa"
                />
              </div>
            </div>
            <div className="stage-table-wrap">
              <div className="stage-table-head">
                <span>VEÍCULO</span>
                {driverStages.map((stage) => (
                  <span key={stage.key}>{stage.label}</span>
                ))}
              </div>
              {stageRows.length ? (
                stageRows.map((item) => (
                  <div className="stage-table-row" key={`${item.plate}-${item.record?.programDate || "programado"}`}>
                    <div className="stage-table-vehicle">
                      <b>{item.plate}</b>
                      <small>{item.route || item.record?.route || "Rota não informada"}</small>
                    </div>
                    {driverStages.map((stage) => {
                      const value = stageValue(item.record, stage.key);
                      const at = item.record?.progress?.[stage.key]?.at ||
                        (value === stage.complete ? item.record?.[stage.timestamp] : null);
                      return (
                        <div className="stage-table-cell" data-label={stage.label} key={stage.key}>
                          <span className={`stage-badge ${value === stage.complete ? "completed" : value ? "waiting" : "missing"}`}>
                            {value || "Sem registro"}
                          </span>
                          {at ? (
                            <small>
                              {new Date(timestampMillis(at)).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </small>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="documentation-empty stage-empty">
                  Nenhum veículo encontrado na programação.
                </p>
              )}
            </div>
          </section>
          <section className="panel documentation-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">ROMANEIO • TEMPO REAL</p>
                <h2>Recebimento da documentação</h2>
                <p>
                  O motorista confirma o recebimento pelo celular após a carga
                  ou descarga.
                </p>
              </div>
              <span className="documentation-total">
                {documentationWaiting.length} aguardando
              </span>
            </div>
            <div className="documentation-groups">
              <div>
                <h3>Aguardando romaneio</h3>
                {documentationWaiting.length ? (
                  documentationWaiting.map((driver) => (
                    <p className="documentation-row" key={driver.plate}>
                      <b>{driver.plate}</b>
                      <span>Doca {driver.dockId || "—"}</span>
                      <strong>
                        {formatDuration(
                          Math.max(
                            0,
                            Math.floor(
                              (now - (timestampMillis(driver.cargoFinishedAt) || now)) /
                                60000,
                            ),
                          ),
                        )} de espera
                      </strong>
                    </p>
                  ))
                ) : (
                  <p className="documentation-empty">
                    Nenhum veículo aguardando documentação.
                  </p>
                )}
              </div>
              <div>
                <h3>Romaneio recebido</h3>
                {documentationReceived.length ? (
                  documentationReceived.slice(0, 6).map((driver) => (
                    <p className="documentation-row" key={driver.plate}>
                      <b>{driver.plate}</b>
                      <span>
                        Recebido às{" "}
                        {new Date(
                          timestampMillis(driver.documentationReceivedAt),
                        ).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <strong>
                        {driver.status === "Veículo liberado"
                          ? "Saída liberada"
                          : "Aguardando liberação de saída"}
                      </strong>
                    </p>
                  ))
                ) : (
                  <p className="documentation-empty">
                    Nenhum romaneio confirmado neste turno.
                  </p>
                )}
              </div>
            </div>
          </section>
          <DockMap
            liveDocks={liveDocks}
            expanded={false}
            onExpand={() => setMapOpen(true)}
          />
          {mapOpen ? (
            <DockMap
              liveDocks={liveDocks}
              expanded
              onClose={() => setMapOpen(false)}
            />
          ) : null}
        </>
      ) : null}
      {activeNav === "Relatórios" ? (
        <section className="report-dashboard">
          <div className="report-banner">
            <div>
              <h2>DASHBOARD | CONTROLE DE PÁTIO</h2>
              <p>Fechamento operacional do turno 22h–6h20</p>
            </div>
            <div>
                <b>iMile • SP1 E SP8 - GUARULHOS</b>
              <span>Data: {scheduleReferenceDate || "—"}</span>
              <button onClick={downloadReportPng}>
                <Download size={16} /> Baixar PNG
              </button>
            </div>
          </div>
          {departureReport.length ? (
            <>
              <div className="report-kpis dashboard-kpis">
                <article>
                  <span>VEÍCULOS PROGRAMADOS</span>
                  <b>{reportTotals.total}</b>
                  <small>Programação vigente</small>
                </article>
                <article className="report-good">
                  <span>SAÍRAM NO HORÁRIO</span>
                  <b>{reportTotals.onTime}</b>
                  <small>
                    {reportTotals.total
                      ? Math.round(
                          (reportTotals.onTime / reportTotals.total) * 100,
                        )
                      : 0}
                    % do total
                  </small>
                </article>
                <article className="report-bad">
                  <span>SAÍRAM ATRASADOS</span>
                  <b>{reportTotals.late}</b>
                  <small>
                    {reportTotals.total
                      ? Math.round(
                          (reportTotals.late / reportTotals.total) * 100,
                        )
                      : 0}
                    % do total
                  </small>
                </article>
                <article className="report-wait">
                  <span>SAÍDA PENDENTE</span>
                  <b>{reportTotals.pending}</b>
                  <small>
                    {reportTotals.total
                      ? Math.round(
                          (reportTotals.pending / reportTotals.total) * 100,
                        )
                      : 0}
                    % do total
                  </small>
                </article>
              </div>
              <div className="report-middle">
                <article className="report-box flow-box">
                  <div className="report-box-title">
                    <h3>Fluxo de veículos por horário</h3>
                    <p>
                      <i className="blue-key" />
                      Chegadas <i className="cyan-key" />
                      Liberações
                    </p>
                  </div>
                  <FlowChart
                    arrivals={reportDashboard.arrivals}
                    releases={reportDashboard.releases}
                  />
                </article>
                <article className="report-box route-box">
                  <h3>Atrasos por rota</h3>
                  {reportDashboard.routes.length ? (
                    reportDashboard.routes.map(([route, delay]) => (
                      <div className="route-bar" key={route}>
                        <span>{route}</span>
                        <i
                          style={{
                            width: `${Math.max(8, (delay / Math.max(...reportDashboard.routes.map((item) => item[1]))) * 72)}%`,
                          }}
                        />
                        <b>{delay} min</b>
                      </div>
                    ))
                  ) : (
                    <p className="no-data">Nenhuma saída atrasada.</p>
                  )}
                </article>
                <article className="report-box stay-box">
                  <h3>MAIORES PERMANÊNCIAS</h3>
                  <div>
                    <h4>Veículos no CDC</h4>
                    {reportDashboard.stays.length ? (
                      reportDashboard.stays.map((item, index) => (
                        <p key={item.plate}>
                          <span>
                            {index + 1}. {item.plate}
                          </span>
                          <b>{formatDuration(item.minutes)}</b>
                        </p>
                      ))
                    ) : (
                      <small>Sem permanências registradas.</small>
                    )}
                  </div>
                </article>
              </div>
              <div className="report-bottom">
                <article className="report-box composition-box">
                  <h3>COMPOSIÇÃO DAS SAÍDAS</h3>
                  <div>
                    <div
                      className="report-donut"
                      style={{
                        background: `conic-gradient(#0967de 0 ${reportTotals.total ? (reportTotals.onTime / reportTotals.total) * 100 : 0}%,#e94b48 0 ${reportTotals.total ? ((reportTotals.onTime + reportTotals.late) / reportTotals.total) * 100 : 0}%,#f1b83b 0)`,
                      }}
                    >
                      <span>
                        <b>
                          {reportTotals.total
                            ? Math.round(
                                (reportTotals.onTime / reportTotals.total) *
                                  100,
                              )
                            : 0}
                          %
                        </b>
                        no horário
                      </span>
                    </div>
                    <ul>
                      <li>
                        <i className="dot-blue" />
                        No horário <b>{reportTotals.onTime}</b>
                      </li>
                      <li>
                        <i className="dot-red" />
                        Atrasados <b>{reportTotals.late}</b>
                      </li>
                      <li>
                        <i className="dot-yellow" />
                        Pendentes <b>{reportTotals.pending}</b>
                      </li>
                    </ul>
                  </div>
                </article>
                <article className="report-box insight-box">
                  <h3>INSIGHT OPERACIONAL</h3>
                  <strong>{reportTotals.late} veículos</strong>
                  <p>
                    {reportTotals.late
                      ? `saíram após o horário programado. ${reportDashboard.routes[0] ? `A rota ${reportDashboard.routes[0][0]} concentrou o maior atraso: ${reportDashboard.routes[0][1]} minutos.` : ""} Priorize a liberação das docas com maior desvio.`
                      : "Não foram registradas saídas atrasadas no turno."}
                  </p>
                </article>
                <article className="report-box focus-box">
                  <h3>FOCO DE TRATATIVA</h3>
                  {reportDashboard.routes
                    .slice(0, 3)
                    .map(([route, delay], index) => (
                      <p key={route}>
                        <em>0{index + 1}</em>
                        <b>{route}</b>
                        <span>{delay} min</span>
                      </p>
                    ))}
                </article>
              </div>
            </>
          ) : (
            <p className="empty-section">
              Nenhuma programação disponível para gerar o relatório.
            </p>
          )}
        </section>
      ) : null}
    </>
  );
}

function DriverPortal() {
  const params = new URLSearchParams(locationSearch());
  const [plate, setPlate] = useState(
    params.get("placa")?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 7) || "",
  );
  const [route, setRoute] = useState("");
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
    } catch (e) {
      setError(e?.message || "Não foi possível consultar a programação.");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="scan-page driver-page">
      <div className="scan-card driver-card">
        <div className="scan-brand">
          <span><CarFront /></span>
          <b>Controle de Pátio</b>
        </div>
        <p className="eyebrow">ACOMPANHAMENTO DO MOTORISTA</p>
        <h1>Atualize sua operação no CDC</h1>
        <p className="scan-help">
          Com o veículo parado, informe a placa e a rota. Selecione a opção que
          corresponde à situação atual em cada etapa.
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
              {loading ? "Consultando..." : "Consultar operação"}
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="driver-identification">
              <strong>{programmed.plate}</strong>
              <span>{programmed.route || route} • Programação {programmed.date}</span>
              <button onClick={() => { setProgrammed(null); setRecord(null); setDock(""); setError(""); setMessage(""); }}>
                Trocar placa
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="driver-message">{message}</p> : null}
            <div className="driver-stages">
              {driverStages.map((stage, index) => {
                const currentValue = stageValue(record, stage.key);
                const prior = driverStages[index - 1];
                const enabled = !prior || stageValue(record, prior.key) === prior.complete;
                const at = record?.progress?.[stage.key]?.at || record?.[stage.timestamp];
                return (
                  <section className="driver-stage" key={stage.key}>
                    <div className="driver-stage-header">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h2>{stage.label}</h2>
                        <p>
                          {currentValue ? `Atual: ${currentValue}` : "Sem registro"}
                          {at ? ` • ${new Date(timestampMillis(at)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </p>
                      </div>
                    </div>
                    {stage.key === "patio" && enabled ? (
                      <label className="driver-dock-label">
                        Doca para endocamento
                        <select value={dock} onChange={(e) => setDock(e.target.value)}>
                          <option value="">Selecione a doca</option>
                          {docks.filter((item) => !item.blocked).map((item) => (
                            <option key={item.id} value={item.id}>{item.id}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className="driver-stage-options">
                      {[stage.waiting, stage.complete].map((value) => (
                        <button
                          key={value}
                          className={currentValue === value ? "selected" : ""}
                          aria-pressed={currentValue === value}
                          disabled={!enabled || saving}
                          onClick={() => updateStage(stage, value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    {!enabled ? <small>Conclua a etapa anterior para continuar.</small> : null}
                  </section>
                );
              })}
            </div>
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
                href={`/?motorista=cdc&placa=${encodeURIComponent(plate.toUpperCase())}`}
              >
                Atualizar romaneio e saída
              </a>
            ) : null}
            {resultLabel.includes("Romaneio recebido") ? (
              <a
                className="primary full documentation-link"
                href={`/?motorista=cdc&placa=${encodeURIComponent(plate.toUpperCase())}`}
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

function App() {
  const [screen] = useState(() => {
    const params = new URLSearchParams(locationSearch());
    if (params.get("motorista") === "cdc" || params.get("chegada") === "cdc")
      return "driver";
    if (params.has("local") || params.get("documentacao") === "cdc")
      return "scan";
    return "admin";
  });
  const [open, setOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Visão geral");
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
  const navigate = (n) => {
    setActiveNav(n);
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (!authReady)
    return (
      <div className="scan-page">
        <div className="scan-card">
          <div className="scan-brand">
            <span>
              <QrCode />
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
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brandmark">
            <CarFront />
          </div>
          <div>
            <b>Controle de Pátio</b>
            <span>SP1 E SP8 - GUARULHOS</span>
          </div>
          <button className="mobile-close" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              key={n}
              className={activeNav === n ? "active" : ""}
              onClick={() => navigate(n)}
            >
              <I size={18} />
              {n}
            </button>
          ))}
        </nav>
        <div className="profile">
          <div>iM</div>
          <p>
            <b>iMile</b>
            <span>Administradora</span>
          </p>
        </div>
      </aside>
      <main>
        <button className="mobile-menu" onClick={() => setOpen(true)}>
          <Menu />
        </button>
        <Dashboard activeNav={activeNav} onScan={() => setScreen("scan")} />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
