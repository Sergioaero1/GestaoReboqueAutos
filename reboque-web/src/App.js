import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "firebase/auth";

// Configuração Firebase (Lendo do seu .env)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);

// Ícones Leaflet corrigidos
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com',
  iconUrl: 'https://unpkg.com',
  shadowUrl: 'https://unpkg.com',
});

function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('mapa');
  const [motoristas, setMotoristas] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [filtroPlaca, setFiltroPlaca] = useState('');
  const [checklistSelecionado, setChecklistSelecionado] = useState(null);
  const [placa, setPlaca] = useState('');
  const [avaria, setAvaria] = useState('');
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => { setUsuarioLogado(user); });
  }, []);

  const buscarDados = async () => {
    try {
      const resM = await axios.get('http://localhost:3001/rastreio/painel');
      setMotoristas(resM.data);
      const resC = await axios.get('http://localhost:3001/checklists/relatorio');
      setChecklists(resC.data);
    } catch (e) { console.error("Erro na API:", e); }
  };

  useEffect(() => {
    if (usuarioLogado) {
      buscarDados();
      const interval = setInterval(buscarDados, 5000);
      return () => clearInterval(interval);
    }
  }, [usuarioLogado]);

  const handleLoginAdmin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, emailLogin, senhaLogin); }
    catch (error) { alert("Acesso Negado!"); }
  };

  const deletarMotorista = async (id, nome) => {
    if (window.confirm(`Excluir motorista ${nome}?`)) {
      try {
        await axios.delete(`http://localhost:3001/motorista/deletar/${id}`);
        buscarDados();
      } catch (e) { alert("Erro ao deletar!"); }
    }
  };

  const enviarChecklistWeb = async (e) => {
    e.preventDefault();
    if (!foto) return alert("Selecione uma foto!");
    setEnviando(true);
    const fd = new FormData();
    fd.append('firebase_uid', usuarioLogado.uid);
    fd.append('placa_veiculo_cliente', placa.toUpperCase());
    fd.append('tipo_avaria', avaria);
    fd.append('foto', foto[0]);
    try {
      await axios.post('http://localhost:3001/checklist/enviar', fd);
      setAbaAtiva('relatorios');
      buscarDados();
    } catch (err) { alert("Erro no registro!"); }
    finally { setEnviando(false); }
  };

  if (!usuarioLogado) {
    return (
      <div style={formWrapper}>
        <form onSubmit={handleLoginAdmin} style={cardForm}>
          <h2 style={{textAlign: 'center', color: '#1e272e'}}>Zétrikas Admin</h2>
          <input style={inputS} type="email" placeholder="E-mail Administrativo" onChange={e => setEmailLogin(e.target.value)} required />
          <input style={inputS} type="password" placeholder="Senha" onChange={e => setSenhaLogin(e.target.value)} required />
          <button style={enviarBtn}>ENTRAR NO PAINEL</button>
        </form>
      </div>
    );
  }

  return (
    <div style={layoutBase}>
      <header style={headerStyle}>
        <div style={brandContainer}>
          <h2 style={titleStyle}>ZÉTRIKAS REBOQUE</h2>
          <span style={badge}>PRO</span>
          <button onClick={() => signOut(auth)} style={logoutBtn}>SAIR</button>
        </div>
        <nav style={navContainer}>
          <button onClick={() => setAbaAtiva('mapa')} style={abaAtiva === 'mapa' ? activeBtn : navBtn}>📍 MAPA</button>
          <button onClick={() => setAbaAtiva('checklist')} style={abaAtiva === 'checklist' ? activeBtn : navBtn}>➕ NOVO</button>
          <button onClick={() => setAbaAtiva('relatorios')} style={abaAtiva === 'relatorios' ? activeBtn : navBtn}>📄 RELATÓRIOS</button>
          <button onClick={() => setAbaAtiva('frota')} style={abaAtiva === 'frota' ? activeBtn : navBtn}>🚛 FROTA</button>
        </nav>
      </header>

      <main style={{ ...mainContent, display: 'flex', flexDirection: abaAtiva === 'mapa' ? 'row' : 'column', padding: 0 }}>
        
        {/* SIDEBAR DE STATUS NO MAPA */}
        {abaAtiva === 'mapa' && (
          <div style={sidebarStyle}>
            <h3 style={{ fontSize: '0.8rem', marginBottom: '10px', color: '#2c3e50' }}>STATUS FROTA</h3>
            {motoristas.map(m => {
              const isOnline = m.ultima_atualizacao && (Math.abs(new Date().getTime() - new Date(m.ultima_atualizacao).getTime()) < 600000);
              return (
                <div key={m.id} style={{...motoristaStatusCard, opacity: isOnline ? 1 : 0.5}}>
                  <span style={{ color: isOnline ? '#2ecc71' : '#95a5a6' }}>● </span>
                  <strong style={{fontSize: '0.75rem'}}>{m.nome}</strong>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
          {abaAtiva === 'mapa' && (
            <MapContainer center={[-22.9395, -43.0700]} zoom={15} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {motoristas.filter(m => {
                if (!m.latitude || !m.ultima_atualizacao) return false;
                const diffMinutos = Math.abs(new Date().getTime() - new Date(m.ultima_atualizacao).getTime()) / (1000 * 60);
                return diffMinutos < 10;
              }).map(m => (
                <Marker key={m.id} position={[Number(m.latitude), Number(m.longitude)]}>
                  <Popup><b>{m.nome}</b><br/>{m.placa_guincho}</Popup>
                </Marker>
              ))}
            </MapContainer>
          )}

          {abaAtiva === 'relatorios' && (
            <div style={{padding: '20px'}}>
               <div style={searchBarContainer}>
                  <input type="text" placeholder="🔍 Buscar placa..." style={searchInput} onChange={e => setFiltroPlaca(e.target.value)} />
               </div>
               <div style={gridRelatorio}>
                {checklists.filter(c => c.placa_veiculo_cliente.toLowerCase().includes(filtroPlaca.toLowerCase())).map(c => (
                  <div key={c.id} style={cardCompacto} onClick={() => setChecklistSelecionado(c)}>
                    <img src={c.url_foto_cloudinary} style={imgStyle} alt="carro" />
                    <div style={cardBody}>
                      <div style={placaDestaque}>{c.placa_veiculo_cliente}</div>
                      <p style={infoText}>👤 {c.motorista_nome}</p>
                    </div>
                  </div>
                ))}
               </div>
            </div>
          )}

          {abaAtiva === 'frota' && (
            <div style={containerGestao}>
              <h3 style={{marginBottom: '15px'}}>🚛 Frota Completa ({motoristas.length})</h3>
              <table style={tabelaStyle}>
                <thead><tr><th style={tdStyle}>Nome</th><th style={tdStyle}>Placa</th><th style={tdStyle}>Ação</th></tr></thead>
                <tbody>
                  {motoristas.map(m => (
                    <tr key={m.id}><td style={tdStyle}>{m.nome}</td><td style={tdStyle}>{m.placa_guincho}</td>
                    <td style={tdStyle}><button onClick={() => deletarMotorista(m.id, m.nome)} style={btnExcluir}>EXCLUIR</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {abaAtiva === 'checklist' && (
            <div style={formWrapperInterno}>
              <div style={cardFormInterno}>
                <h3 style={{marginBottom: '15px'}}>Novo Registro Web</h3>
                <form onSubmit={enviarChecklistWeb}>
                  <input style={inputS} placeholder="Placa do Veículo" onChange={e => setPlaca(e.target.value)} required />
                  <textarea style={{...inputS, height: '80px'}} placeholder="Descreva as avarias" onChange={e => setAvaria(e.target.value)} />
                  <input type="file" style={inputS} onChange={e => setFoto(e.target.files)} required />
                  <button style={enviarBtnInterno}>{enviando ? 'Enviando...' : 'SALVAR REGISTRO'}</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE DETALHES */}
      {checklistSelecionado && (
        <div style={modalOverlay} onClick={() => setChecklistSelecionado(null)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <img src={checklistSelecionado.url_foto_cloudinary} style={imgFull} alt="Foto" />
            <div style={{padding: '20px'}}>
              <h2 style={{marginBottom: '10px'}}>{checklistSelecionado.placa_veiculo_cliente}</h2>
              <p style={{marginBottom: '5px'}}><b>Motorista:</b> {checklistSelecionado.motorista_nome}</p>
              <p style={descricaoFull}><b>Observações:</b><br/>{checklistSelecionado.tipo_avaria}</p>
              <button onClick={() => setChecklistSelecionado(null)} style={closeBtn}>FECHAR DETALHES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ESTILOS DEFINITIVOS (CORRIGIDOS) ---
const layoutBase = { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa', fontFamily: 'Inter, sans-serif' };
const headerStyle = { backgroundColor: '#1e272e', color: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const brandContainer = { display: 'flex', alignItems: 'center', gap: '10px' };
const titleStyle = { margin: 0, fontSize: '1.1rem', fontWeight: '800' };
const badge = { backgroundColor: '#3498db', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px' };
const navContainer = { display: 'flex', gap: '5px' };
const mainContent = { flex: 1, overflowY: 'auto' };
const sidebarStyle = { width: '180px', backgroundColor: 'white', borderRight: '1px solid #ddd', padding: '15px' };
const motoristaStatusCard = { padding: '8px', marginBottom: '5px', backgroundColor: '#f9f9f9', borderRadius: '5px', border: '1px solid #eee' };
const gridRelatorio = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginTop: '10px' };
const cardCompacto = { backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', cursor: 'pointer' };
const imgStyle = { width: '100%', height: '110px', objectFit: 'cover' };
const cardBody = { padding: '8px' };
const infoText = { margin: 0, fontSize: '0.75rem', color: '#7f8c8d' };
const placaDestaque = { fontSize: '0.85rem', fontWeight: 'bold', color: '#2c3e50', backgroundColor: '#f1f2f6', padding: '2px 5px', borderRadius: '4px', marginBottom: '5px', display: 'inline-block' };
const inputS = { width: '100%', padding: '10px', margin: '5px 0', border: '1px solid #ddd', borderRadius: '5px', boxSizing: 'border-box' };
const enviarBtn = { width: '100%', padding: '12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const enviarBtnInterno = { ...enviarBtn, backgroundColor: '#00b894' };
const navBtn = { padding: '6px 12px', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#2f3640', color: 'white', fontSize: '0.75rem', fontWeight: 'bold' };
const activeBtn = { ...navBtn, backgroundColor: '#3498db' };
const logoutBtn = { backgroundColor: '#c0392b', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 'bold' };
const formWrapper = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e272e' };
const cardForm = { backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '320px' };
const formWrapperInterno = { padding: '40px', display: 'flex', justifyContent: 'center' };
const cardFormInterno = { ...cardForm, boxShadow: '0 4px 15px rgba(0,0,0,0.1)' };
const containerGestao = { padding: '20px' };
const tabelaStyle = { width: '100%', borderCollapse: 'collapse' };
const tdStyle = { padding: '12px', borderBottom: '1px solid #eee', textAlign: 'left', fontSize: '0.9rem' };
const btnExcluir = { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 'bold' };
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContent = { backgroundColor: 'white', borderRadius: '10px', width: '90%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' };
const imgFull = { width: '100%', height: '300px', objectFit: 'contain', backgroundColor: '#000' };
const closeBtn = { backgroundColor: '#34495e', color: 'white', border: 'none', padding: '12px', width: '100%', cursor: 'pointer', fontWeight: 'bold' };
const descricaoFull = { padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', fontSize: '0.9rem', color: '#444', lineHeight: '1.4' };

// AQUI ESTÁ O QUE FALTAVA:
const searchBarContainer = { marginBottom: '15px', backgroundColor: 'white', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
const searchInput = { padding: '8px 12px', borderRadius: '5px', border: '1px solid #ddd', width: '220px', outline: 'none' };

export default App;
