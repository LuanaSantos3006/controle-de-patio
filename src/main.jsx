import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CarFront, Clock3, Container, LayoutDashboard, MapPin, QrCode, Search, Truck, Users, BarChart3, Menu, X, LogOut, ChevronRight, CircleCheck, AlertTriangle, Maximize2 } from 'lucide-react';
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db, firebaseReady } from './firebase';
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

const minutesWaiting = d => d.arrivalAt?.toDate ? Math.max(0,Math.floor((Date.now()-d.arrivalAt.toDate().getTime())/60000)) : (d.minutes||0);
const timeTone = minutes => minutes>60?'time-red':minutes>30?'time-yellow':'time-green';

function DockMap({liveDocks,expanded,onExpand,onClose}) {
 const available=17-Object.keys(liveDocks).length;
 return <section className={`panel dock-panel ${expanded?'dock-modal':''}`}>
  <div className="panel-head"><div><p className="eyebrow">SP8 • GUARULHOS • TEMPO REAL</p><h2>Mapa operacional das docas</h2><p>18 posições físicas • clique para visualizar o mapa completo</p></div><div className="dock-actions"><span className="dock-count">{available} disponíveis</span><button className="expand-map" onClick={expanded?onClose:onExpand} aria-label={expanded?'Fechar mapa':'Expandir mapa'}>{expanded?<X size={18}/>:<Maximize2 size={18}/>} {expanded?'Fechar':'Ver mapa inteiro'}</button></div></div>
  <div className="dock-grid">{docks.map(d=>{const active=liveDocks[d.id];return <article key={d.id} className={`dock-card ${d.blocked?'blocked':''} ${active?'occupied':''}`}><div className="dock-number"><Truck size={17}/><strong>{d.id}</strong></div><div className="dock-bases">{d.bases.map(b=><span key={b}>{b}</span>)}</div>{active?<div className="dock-live"><b>{active.plate}</b><span>Rota {active.route||'não informada'}</span></div>:null}<small>{d.blocked?'INTERDITADA':active?'OCUPADA':'DISPONÍVEL'}</small></article>})}</div>
  <div className="conveyor"><span>Esteira / Conveyor</span></div>
 </section>
}

function Dashboard({onScan}) {
 const [query,setQuery]=useState('');
 const [allDrivers,setAllDrivers]=useState(firebaseReady?[]:initialDrivers);
 const [mapOpen,setMapOpen]=useState(false);
 useEffect(()=>{if(!firebaseReady||!db)return;return onSnapshot(collection(db,'presencas'),snap=>setAllDrivers(snap.docs.map(item=>({id:item.id,...item.data()}))))},[]);
 const activeDrivers=useMemo(()=>allDrivers.filter(d=>d.status!=='Veículo liberado').sort((a,b)=>(b.arrivalAt?.seconds||0)-(a.arrivalAt?.seconds||0)).reverse(),[allDrivers]);
 const filtered=useMemo(()=>activeDrivers.filter(d=>`${d.plate||''} ${d.name||''} ${d.place||d.location||''}`.toLowerCase().includes(query.toLowerCase())),[query,activeDrivers]);
 const liveDocks=useMemo(()=>Object.fromEntries(activeDrivers.filter(d=>d.status==='Endocado'&&d.dockId).map(d=>[d.dockId,d])),[activeDrivers]);
 const waiting=activeDrivers.filter(d=>d.status?.includes('Aguardando')).length;
 const docked=activeDrivers.filter(d=>d.status==='Endocado').length;
 const released=allDrivers.filter(d=>d.status==='Veículo liberado').length;
 const newPlates=activeDrivers.filter(d=>d.registered===false).length;
 const availableDocks=docks.filter(d=>!d.blocked&&!liveDocks[d.id]);
 return <>
  <header className="top"><div><p className="eyebrow">OPERAÇÃO • TEMPO REAL</p><h1>Visão geral do pátio</h1><p className="sub">Acompanhe a localização e o tempo de permanência dos motoristas.</p></div><button className="primary" onClick={onScan}><QrCode size={18}/> Simular leitura</button></header>
  <section className="stats"><Stat icon={Truck} label="No pátio agora" value={activeDrivers.length} detail="Capacidade monitorada em tempo real" tone="blue"/><Stat icon={Clock3} label="Em espera" value={waiting} detail="Fila por ordem de chegada" tone="amber"/><Stat icon={Container} label="Nas docas" value={docked} detail={`${availableDocks.length} posições disponíveis`} tone="cyan"/><Stat icon={CircleCheck} label="Veículos liberados" value={released} detail="Finalizados após carga/descarga" tone="green"/></section>
  <section className="grid-main"><div className="panel live"><div className="panel-head"><div><h2>Acompanhamento operacional</h2><p>Atualização automática pelas leituras dos QR Codes</p></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar placa ou motorista"/></div></div><div className="table-wrap"><table className="queue-table"><thead><tr><th>ORDEM</th><th>MOTORISTA</th><th>LOCALIZAÇÃO</th><th>PERMANÊNCIA</th><th>ROTA</th><th>STATUS</th></tr></thead><tbody>{filtered.length?filtered.map((d,index)=>{const mins=minutesWaiting(d);return <tr key={d.plate}><td><b>#{index+1}</b></td><td><b>{d.plate}</b><span>{d.name||'Cadastro pendente'}</span>{d.registered===false?<em className="new-plate">PLACA NOVA</em>:null}</td><td><b className="place"><MapPin size={14}/>{d.place||d.location}</b><span>{d.carrier||''}</span></td><td><span className={`time-chip ${timeTone(mins)}`}>{mins} min</span></td><td>{d.route||'—'}</td><td><span className={`pill ${d.status?.includes('Aguardando')?'wait':'work'}`}>{d.status}</span></td></tr>}):<tr><td colSpan="6" className="empty-row">Nenhum motorista no pátio</td></tr>}</tbody></table></div></div>
  <aside className="panel summary"><div className="panel-head"><div><h2>Ocupação</h2><p>Capacidade operacional</p></div></div><div className="capacity"><strong>{activeDrivers.length}</strong><span>veículos no CDC</span><small>Capacidade máxima do pátio a configurar</small></div><div className="legend"><p><i className="dot parking"/>Aguardando <b>{waiting}</b></p><p><i className="dot dock"/>Endocados <b>{docked}</b></p><p><i className="dot moving"/>Liberados hoje <b>{released}</b></p></div>{newPlates>0?<div className="alert red-alert"><AlertTriangle size={18}/><div><b>{newPlates} placa(s) aguardando cadastro</b><span>Complete os dados dos novos motoristas.</span></div></div>:null}<div className="alert"><AlertTriangle size={18}/><div><b>Doca 58 interditada</b><span>SBD e AGFI sem operação nesta posição.</span></div></div></aside></section>
  <DockMap liveDocks={liveDocks} expanded={false} onExpand={()=>setMapOpen(true)}/>{mapOpen?<DockMap liveDocks={liveDocks} expanded onClose={()=>setMapOpen(false)}/>:null}
 </>
}

function Scan({onBack}) {
 const [plate,setPlate]=useState(''); const [route,setRoute]=useState(''); const [done,setDone]=useState(false); const [saving,setSaving]=useState(false); const [error,setError]=useState(''); const [finishPending,setFinishPending]=useState(false); const [resultLabel,setResultLabel]=useState('');
 const params=new URLSearchParams(locationSearch()); const location=params.get('local')||'Próximo da Doca 52'; const dockId=params.get('doca'); const isArrival=location==='Portaria'; const eventName=isArrival?'Chegada no CDC':dockId?`Doca ${dockId}`:location;
 const writeMovement=async(normalized,payload,event)=>{await setDoc(doc(db,'presencas',normalized),payload,{merge:true});await addDoc(collection(db,'movimentacoes'),{...payload,event,createdAt:serverTimestamp()})};
 const confirm=async()=>{if(!firebaseReady||!db){setError('A conexão com o sistema não está configurada.');return}setSaving(true);setError('');try{const normalized=plate.toUpperCase();const presenceRef=doc(db,'presencas',normalized);const currentSnap=await getDoc(presenceRef);const current=currentSnap.exists()?currentSnap.data():null;if(dockId&&current?.status==='Endocado'&&current?.dockId===dockId){setFinishPending(true);return}const driverQuery=query(collection(db,'motoristas'),where('plate','==',normalized),limit(1));const registered=!(await getDocs(driverQuery)).empty;const status=dockId?'Endocado':'Aguardando';const stageTime=isArrival?{arrivalAt:serverTimestamp()}:dockId?{dockedAt:serverTimestamp()}:{};const label=isArrival?'Chegada no CDC':dockId?`Endocado — Doca ${dockId}`:location;const payload={plate:normalized,route:route.toUpperCase(),location:label,status,dockId:dockId||null,registered,...stageTime,updatedAt:serverTimestamp()};await writeMovement(normalized,payload,isArrival?'CHEGADA_NO_CDC':dockId?'ENDOCADO':'LOCALIZACAO_PATIO');if(!registered)await setDoc(doc(db,'alertas',`placa-${normalized}`),{type:'PLACA_NOVA',plate:normalized,route:route.toUpperCase(),read:false,createdAt:serverTimestamp()},{merge:true});setResultLabel(label);setDone(true)}catch(e){setError(e?.code==='permission-denied'?'O banco de dados ainda não autorizou este registro. Verifique as regras do Firebase.':'Não foi possível registrar. Confira sua conexão e tente novamente.')}finally{setSaving(false)}};
 const finish=async()=>{setSaving(true);setError('');try{const normalized=plate.toUpperCase();const payload={plate:normalized,route:route.toUpperCase(),status:'Veículo liberado',location:'Carga/descarga finalizada',dockId:null,releasedAt:serverTimestamp(),updatedAt:serverTimestamp()};await writeMovement(normalized,payload,'VEICULO_LIBERADO');setResultLabel('Carga/descarga finalizada — Veículo liberado');setFinishPending(false);setDone(true)}catch(e){setError(e?.code==='permission-denied'?'O banco de dados ainda não autorizou este registro. Verifique as regras do Firebase.':'Não foi possível finalizar. Confira sua conexão e tente novamente.')}finally{setSaving(false)}};
 return <div className="scan-page"><div className="scan-card"><div className="scan-brand"><span><QrCode/></span><b>Controle de Pátio</b></div>{done?<div className="success"><div className="success-icon"><CircleCheck size={42}/></div><p className="eyebrow">REGISTRO CONFIRMADO</p><h1>{resultLabel.includes('liberado')?'Veículo liberado!':'Registro realizado!'}</h1><p>{resultLabel.includes('liberado')?'A finalização da carga/descarga foi registrada.':'Sua localização foi enviada ao controle operacional.'}</p><div className="receipt"><span>Placa<b>{plate.toUpperCase()}</b></span><span>Rota<b>{route.toUpperCase()}</b></span><span>Registro<b>{resultLabel}</b></span><span>Horário<b>{new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b></span></div><button className="primary full" onClick={onBack}>Concluir</button></div>:finishPending?<div className="success"><p className="eyebrow">FINALIZAÇÃO DA OPERAÇÃO</p><h1>Finalizar carga/descarga?</h1><p>O veículo <b>{plate.toUpperCase()}</b> já está registrado na Doca {dockId}. Confirme somente se a operação terminou e o veículo está liberado.</p>{error?<p className="form-error">{error}</p>:null}<button disabled={saving} className="primary full" onClick={finish}>{saving?'Finalizando...':'Confirmar e liberar veículo'} <CircleCheck size={18}/></button><button disabled={saving} className="secondary full" onClick={()=>setFinishPending(false)}>Voltar</button></div>:<><p className="eyebrow">CONFIRMAÇÃO DE LOCALIZAÇÃO</p><h1>Você está em<br/><em>{eventName}</em></h1><p className="scan-help">Informe somente a placa e a rota para confirmar sua localização.</p><label>Placa do veículo</label><input className="plate-input" maxLength="7" value={plate} onChange={e=>setPlate(e.target.value.replace(/[^a-zA-Z0-9]/g,''))} placeholder="ABC1D23"/><label>Rota</label><input className="route-input" value={route} onChange={e=>setRoute(e.target.value)} placeholder="Informe a rota"/>{error?<p className="form-error">{error}</p>:null}<button disabled={plate.length<7||!route.trim()||saving} className="primary full" onClick={confirm}>{saving?'Verificando...':'Confirmar localização'} <ChevronRight size={18}/></button><small className="safe">Na segunda leitura da mesma doca, você poderá finalizar a operação.</small></>}</div></div>
}
function locationSearch(){ return typeof window==='undefined'?'':window.location.search }

function App(){const [screen,setScreen]=useState(locationSearch().includes('local=')?'scan':'admin'); const [open,setOpen]=useState(false); const [authReady,setAuthReady]=useState(false); const [authError,setAuthError]=useState(''); useEffect(()=>{if(!firebaseReady||!auth){setAuthError('A conexão com o Firebase não está configurada.');return}let signingIn=false;const unsubscribe=onAuthStateChanged(auth,user=>{if(user){setAuthReady(true);setAuthError('');return}if(signingIn)return;signingIn=true;signInAnonymously(auth).catch(error=>{console.error('Falha na autenticação anônima:',error);setAuthError('Não foi possível conectar ao sistema. Atualize a página e tente novamente.');}).finally(()=>{signingIn=false})});return unsubscribe},[]); if(!authReady)return <div className="scan-page"><div className="scan-card"><div className="scan-brand"><span><QrCode/></span><b>Controle de Pátio</b></div>{authError?<><p className="eyebrow">CONEXÃO INDISPONÍVEL</p><h1>Não foi possível iniciar</h1><p className="form-error">{authError}</p></>:<><p className="eyebrow">CONECTANDO</p><h1>Aguarde um instante...</h1><p className="scan-help">Preparando o controle operacional.</p></>}</div></div>; return screen==='scan'?<Scan onBack={()=>setScreen('admin')}/>:<div className="app"><aside className={`sidebar ${open?'open':''}`}><div className="brand"><div className="brandmark"><CarFront/></div><div><b>Controle de Pátio</b><span>Gestão operacional</span></div><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button></div><nav>{nav.map(([n,I],i)=><button key={n} className={i===0?'active':''}><I size={18}/>{n}</button>)}</nav><div className="profile"><div>iM</div><p><b>iMile</b><span>Administradora</span></p><LogOut size={17}/></div></aside><main><button className="mobile-menu" onClick={()=>setOpen(true)}><Menu/></button><Dashboard onScan={()=>setScreen('scan')}/></main></div>}

createRoot(document.getElementById('root')).render(<App/>);
