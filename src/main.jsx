import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CarFront, Clock3, Container, LayoutDashboard, MapPin, QrCode, Search, Truck, Users, BarChart3, Menu, X, LogOut, ChevronRight, CircleCheck, AlertTriangle } from 'lucide-react';
import './styles.css';

const initialDrivers = [
  { plate:'FZD6D39', name:'Walleson Matias', carrier:'Transportes Alpha', place:'Doca 03', status:'Em operação', since:'08:42', minutes:38 },
  { plate:'CUA0I23', name:'Bruno Aladim', carrier:'Rota Sul', place:'Estacionamento B', status:'Aguardando', since:'08:15', minutes:65 },
  { plate:'ELU8I19', name:'Gabriel Silveira', carrier:'Log Express', place:'Doca 01', status:'Em operação', since:'09:03', minutes:17 },
  { plate:'EWU1F20', name:'Edivaldo Silva', carrier:'Via Cargo', place:'Estacionamento A', status:'Aguardando', since:'09:11', minutes:9 },
];

const docks = [
  { id:'52', bases:['IPR'] }, { id:'53', bases:['GOS','SVM'] },
  { id:'54', bases:['MAU'] }, { id:'55', bases:['GLS','GUA'] },
  { id:'56', bases:['MRP','ATB'] }, { id:'57', bases:['JDP','JTT','JSS'] },
  { id:'58', bases:['SBD','AGFI'], blocked:true },
  { id:'59-A', bases:['GTS','MBI'] }, { id:'59-B', bases:['LBD'] },
  { id:'60', bases:['LBD'] }, { id:'61', bases:['VLM'] },
  { id:'62', bases:['JDS','GHO'] }, { id:'63-A', bases:['CBL','CSA'] },
  { id:'63-B', bases:['CDR','JANI'] }, { id:'64', bases:['STD','RBI'] },
  { id:'65', bases:['STDI'] }, { id:'66', bases:['ACM'] },
  { id:'67', bases:['AET','BCC'] },
];

const nav = [
  ['Visão geral', LayoutDashboard], ['Motoristas', Users], ['Localizações', MapPin], ['Relatórios', BarChart3]
];

function Stat({icon:Icon,label,value,detail,tone}) { return <article className="stat"><div className={`stat-icon ${tone}`}><Icon size={21}/></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article> }

function Dashboard({onScan}) {
 const [query,setQuery]=useState('');
 const filtered=useMemo(()=>initialDrivers.filter(d=>`${d.plate} ${d.name} ${d.place}`.toLowerCase().includes(query.toLowerCase())),[query]);
 return <>
  <header className="top"><div><p className="eyebrow">OPERAÇÃO • TEMPO REAL</p><h1>Visão geral do pátio</h1><p className="sub">Acompanhe a localização e o tempo de permanência dos motoristas.</p></div><button className="primary" onClick={onScan}><QrCode size={18}/> Simular leitura</button></header>
  <section className="stats"><Stat icon={Truck} label="No pátio agora" value="18" detail="4 chegaram na última hora" tone="blue"/><Stat icon={Clock3} label="Em espera" value="7" detail="Média de 42 minutos" tone="amber"/><Stat icon={Container} label="Nas docas" value="9" detail="3 docas disponíveis" tone="cyan"/><Stat icon={CircleCheck} label="Finalizados hoje" value="24" detail="Tempo médio de 1h18" tone="green"/></section>
  <section className="grid-main"><div className="panel live"><div className="panel-head"><div><h2>Motoristas no pátio</h2><p>Atualização automática a cada leitura</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar placa ou motorista"/></div></div><div className="table-wrap"><table><thead><tr><th>MOTORISTA</th><th>LOCALIZAÇÃO ATUAL</th><th>CHEGADA</th><th>TEMPO</th><th>STATUS</th></tr></thead><tbody>{filtered.map((d,i)=><tr key={d.plate}><td><b>{d.plate}</b><span>{d.name}</span></td><td><b className="place"><MapPin size={14}/>{d.place}</b><span>{d.carrier}</span></td><td>{d.since}</td><td className={d.minutes>60?'late':''}>{d.minutes} min</td><td><span className={`pill ${d.status==='Aguardando'?'wait':'work'}`}>{d.status}</span></td></tr>)}</tbody></table></div></div>
  <aside className="panel summary"><div className="panel-head"><div><h2>Ocupação</h2><p>Distribuição atual</p></div></div><div className="donut"><div><strong>18</strong><span>veículos</span></div></div><div className="legend"><p><i className="dot parking"/>Estacionamento <b>7</b></p><p><i className="dot dock"/>Docas <b>9</b></p><p><i className="dot moving"/>Em deslocamento <b>2</b></p></div><div className="alert"><AlertTriangle size={18}/><div><b>Doca 58 interditada</b><span>SBD e AGFI sem operação nesta posição.</span></div></div></aside></section>
  <section className="panel dock-panel"><div className="panel-head"><div><p className="eyebrow">SP8 • GUARULHOS</p><h2>Mapa operacional das docas</h2><p>18 posições físicas • docas 52 a 67</p></div><span className="dock-count">17 disponíveis</span></div><div className="dock-grid">{docks.map(d=><article key={d.id} className={`dock-card ${d.blocked?'blocked':''}`}><div className="dock-number"><Truck size={17}/><strong>{d.id}</strong></div><div className="dock-bases">{d.bases.map(b=><span key={b}>{b}</span>)}</div><small>{d.blocked?'INTERDITADA':'DISPONÍVEL'}</small></article>)}</div><div className="conveyor"><span>Esteira / Conveyor</span></div></section>
 </>
}

function Scan({onBack}) { const [plate,setPlate]=useState(''); const [done,setDone]=useState(false); const location=new URLSearchParams(locationSearch()).get('local')||'Estacionamento / Espera'; return <div className="scan-page"><div className="scan-card"><div className="scan-brand"><span><QrCode/></span><b>Controle de Pátio</b></div>{done?<div className="success"><div className="success-icon"><CircleCheck size={42}/></div><p className="eyebrow">LOCALIZAÇÃO CONFIRMADA</p><h1>Registro realizado!</h1><p>Sua localização foi enviada ao controle operacional.</p><div className="receipt"><span>Placa<b>{plate.toUpperCase()}</b></span><span>Local<b>{location}</b></span><span>Horário<b>{new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b></span></div><button className="primary full" onClick={onBack}>Concluir</button></div>:<><p className="eyebrow">CONFIRMAÇÃO DE LOCALIZAÇÃO</p><h1>Você está em<br/><em>{location}</em></h1><p className="scan-help">Informe a placa cadastrada do veículo para confirmar sua presença neste ponto.</p><label>Placa do veículo</label><input className="plate-input" maxLength="7" value={plate} onChange={e=>setPlate(e.target.value.replace(/[^a-zA-Z0-9]/g,''))} placeholder="ABC1D23"/><button disabled={plate.length<7} className="primary full" onClick={()=>setDone(true)}>Confirmar localização <ChevronRight size={18}/></button><small className="safe">Seus dados são usados somente para o controle da operação.</small></>}</div></div> }
function locationSearch(){ return typeof window==='undefined'?'':window.location.search }

function App(){const [screen,setScreen]=useState(locationSearch().includes('local=')?'scan':'admin'); const [open,setOpen]=useState(false);return screen==='scan'?<Scan onBack={()=>setScreen('admin')}/>:<div className="app"><aside className={`sidebar ${open?'open':''}`}><div className="brand"><div className="brandmark"><CarFront/></div><div><b>Controle de Pátio</b><span>Gestão operacional</span></div><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button></div><nav>{nav.map(([n,I],i)=><button key={n} className={i===0?'active':''}><I size={18}/>{n}</button>)}</nav><div className="profile"><div>LS</div><p><b>Luana Santos</b><span>Administradora</span></p><LogOut size={17}/></div></aside><main><button className="mobile-menu" onClick={()=>setOpen(true)}><Menu/></button><Dashboard onScan={()=>setScreen('scan')}/></main></div>}

createRoot(document.getElementById('root')).render(<App/>);
