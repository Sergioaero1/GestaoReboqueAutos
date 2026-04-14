import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

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

// Ícones Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com',
  iconUrl: 'https://unpkg.com',
  shadowUrl: 'https://unpkg.com',
});

function App() {
  // Estados de Autenticação
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');

  // Estados de Interface e Dados
  const [abaAtiva, setAbaAtiva] = useState('mapa');
  const [motoristas, setMotoristas] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [filtroPlaca, setFiltroPlaca] = useState('');
  const [checklistSelecionado, setChecklistSelecionado] = useState(null); // ESTADO PARA O MODAL
  
  // Estados Form Novo
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
    } catch (e) { console.error(e); }
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
    if (window.confirm(`Excluir motorista ${nome}? Isso apagará todos os seus checklists!`)) {
        try {
            await axios.delete(`http://localhost:3001/motorista/deletar/${id}`);
            alert("Motorista removido!");
            buscarDados();
        } catch (e) { alert("Erro ao excluir."); }
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
      alert("Veículo registrado!");
      setPlaca(''); setAvaria(''); setFoto(null);
      setAbaAtiva('relatorios');
      buscarDados();
    } catch (err) { alert("Erro ao registrar."); }
    finally { setEnviando(false); }
  };

  const checklistsFiltrados = checklists.filter(c => 
    c.placa_veiculo_cliente.toLowerCase().includes(filtroPlaca.toLowerCase())
  );

  if (!usuarioLogado) {
    return (
      <div style={formWrapper}>
        <form onSubmit={handleLoginAdmin} style={cardForm}>
          <h2 style={{textAlign: 'center', color: '#1e272e'}}>Zétrikas Admin</h2>
          <input style={inputS} type="email" placeholder="E-mail Administrativo" onChange={e => setEmailLogin(e.target.value)} required />
          <input style={inputS} type="password" placeholder="Senha" onChange={e => setSenhaLogin(e.target.value)} required />
          <button style={enviarBtn}>ACESSAR PAINEL</button>
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

      <main style={mainContent}>
        {abaAtiva === 'mapa' && (
          <MapContainer center={[-22.9395, -43.0700]} zoom={15} style={{ height: '100%', borderRadius: '12px' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {motoristas.map(m => m.latitude && (
              <Marker key={m.id} position={[Number(m.latitude), Number(m.longitude)]}>
                <Popup><b>{m.nome}</b><br/>{m.placa_guincho}</Popup>
              </Marker>
            ))}
          </MapContainer>
        )}

        {abaAtiva === 'checklist' && (
          <div style={formWrapperInterno}>
            <div style={cardFormInterno}>
              <h3>Registrar Novo Veículo</h3>
              <form onSubmit={enviarChecklistWeb}>
                <input style={inputS} placeholder="Placa do Cliente" value={placa} onChange={e => setPlaca(e.target.value)} required />
                <textarea style={{...inputS, height: '80px'}} placeholder="Avarias..." value={avaria} onChange={e => setAvaria(e.target.value)} />
                <input type="file" style={inputS} onChange={e => setFoto(e.target.files)} required />
                <button disabled={enviando} style={enviarBtnInterno}>{enviando ? 'PROCESSANDO...' : 'SALVAR CHECKLIST'}</button>
              </form>
            </div>
          </div>
        )}

        {abaAtiva === 'relatorios' && (
          <div style={{ padding: '5px' }}>
            <div style={searchBarContainer}>
              <input type="text" placeholder="🔍 Buscar placa..." style={searchInput} onChange={e => setFiltroPlaca(e.target.value)} />
              <small style={{color: '#7f8c8d'}}>{checklistsFiltrados.length} encontrados</small>
            </div>
            <div style={gridRelatorio}>
              {checklistsFiltrados.map(c => (
                <div key={c.id} style={cardCompacto} onClick={() => setChecklistSelecionado(c)}>
                  <img src={c.url_foto_cloudinary} alt="veiculo" style={imgStyle} />
                  <div style={cardBody}>
                    <h4 style={brandCardText}>ZÉTRIKAS REBOQUE</h4>
                    <div style={placaDestaque}>{c.placa_veiculo_cliente}</div>
                    <p style={infoText}>👤 {c.motorista_nome}</p>
                    <p style={avariaText}>Clique para ver detalhes...</p>
                    <small style={dateText}>{new Date(c.data_registro).toLocaleString('pt-BR')}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {abaAtiva === 'frota' && (
          <div style={containerGestao}>
            <h3>🚛 Gerenciamento de Frota</h3>
            <table style={tabelaStyle}>
              <thead>
                <tr style={{backgroundColor: '#f1f2f6'}}>
                  <th style={tdStyle}>ID</th>
                  <th style={tdStyle}>Nome</th>
                  <th style={tdStyle}>Placa</th>
                  <th style={tdStyle}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {motoristas.map(m => (
                  <tr key={m.id} style={{borderBottom: '1px solid #eee'}}>
                    <td style={tdStyle}>{m.id}</td>
                    <td style={tdStyle}>{m.nome}</td>
                    <td style={tdStyle}>{m.placa_guincho}</td>
                    <td style={tdStyle}>
                      <button onClick={() => deletarMotorista(m.id, m.nome)} style={btnExcluir}>🗑️ EXCLUIR</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* --- MODAL DE DETALHES --- */}
      {checklistSelecionado && (
        <div style={modalOverlay} onClick={() => setChecklistSelecionado(null)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <button style={closeBtn} onClick={() => setChecklistSelecionado(null)}>X</button>
            <img src={checklistSelecionado.url_foto_cloudinary} style={imgFull} alt="Foto completa" />
            <div style={{padding: '20px'}}>
              <h2 style={{color: '#2c3e50', margin: '0 0 10px 0'}}>Veículo: {checklistSelecionado.placa_veiculo_cliente}</h2>
              <p style={{margin: '5px 0'}}><b>Motorista Responsável:</b> {checklistSelecionado.motorista_nome}</p>
              <p style={{margin: '5px 0', color: '#7f8c8d'}}><b>Data do Registro:</b> {new Date(checklistSelecionado.data_registro).toLocaleString()}</p>
              <hr style={{border: '0', borderTop: '1px solid #eee', margin: '15px 0'}} />
              <p style={{fontWeight: 'bold', color: '#e67e22'}}>DESCRIÇÃO COMPLETA DAS AVARIAS:</p>
              <p style={descricaoFull}>
                {checklistSelecionado.tipo_avaria}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ESTILOS ---
const layoutBase = { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa', fontFamily: 'Inter, sans-serif' };
const headerStyle = { backgroundColor: '#1e272e', color: 'white', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const brandContainer = { display: 'flex', alignItems: 'center', gap: '8px' };
const titleStyle = { margin: 0, fontSize: '1.1rem', fontWeight: '800' };
const badge = { backgroundColor: '#3498db', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px' };
const navContainer = { display: 'flex', gap: '4px' };
const mainContent = { flex: 1, overflowY: 'auto', padding: '10px' };
const gridRelatorio = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' };
const cardCompacto = { backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', cursor: 'pointer', transition: '0.2s' };
const imgStyle = { width: '100%', height: '110px', objectFit: 'cover' };
const cardBody = { padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' };
const infoText = { margin: 0, fontSize: '0.75rem', color: '#7f8c8d' };
const avariaText = { margin: '2px 0', fontSize: '0.7rem', color: '#3498db', fontStyle: 'italic', fontWeight: 'bold' };
const dateText = { fontSize: '0.65rem', color: '#bdc3c7' };
const searchBarContainer = { marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '15px', backgroundColor: 'white', padding: '10px', borderRadius: '8px' };
const searchInput = { padding: '8px 12px', borderRadius: '5px', border: '1px solid #ddd', width: '220px' };
const formWrapper = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e272e' };
const formWrapperInterno = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' };
const cardForm = { backgroundColor: 'white', padding: '35px', borderRadius: '15px', width: '350px' };
const cardFormInterno = { ...cardForm, boxShadow: '0 4px 15px rgba(0,0,0,0.1)' };
const inputS = { width: '100%', padding: '12px', margin: '8px 0', border: '1px solid #ddd', borderRadius: '6px', boxSizing: 'border-box' };
const enviarBtn = { width: '100%', padding: '12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const enviarBtnInterno = { ...enviarBtn, backgroundColor: '#00b894' };
const navBtn = { padding: '6px 10px', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#2f3640', color: 'white', fontSize: '0.7rem', fontWeight: 'bold' };
const activeBtn = { ...navBtn, backgroundColor: '#3498db', color: 'white' };
const logoutBtn = { backgroundColor: '#c0392b', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' };
const brandCardText = { margin: '0', fontSize: '0.7rem', color: '#3498db', fontWeight: '800' };
const placaDestaque = { margin: '2px 0 5px 0', fontSize: '0.85rem', fontWeight: 'bold', color: '#2c3e50', backgroundColor: '#f1f2f6', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start' };
const containerGestao = { padding: '20px', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' };
const tabelaStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '20px' };
const tdStyle = { padding: '12px', textAlign: 'left', fontSize: '0.9rem' };
const btnExcluir = { backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.65rem' };

// ESTILOS DO MODAL
const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 };
const modalContent = { backgroundColor: 'white', width: '95%', maxWidth: '600px', maxHeight: '90vh', borderRadius: '12px', overflowY: 'auto', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' };
const imgFull = { width: '100%', height: 'auto', minHeight: '300px', objectFit: 'contain', backgroundColor: '#000' };
const closeBtn = { position: 'absolute', top: '10px', right: '10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem', zIndex: 10 };
const descricaoFull = { whiteSpace: 'pre-wrap', backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3498db', marginTop: '10px', color: '#34495e', lineHeight: '1.5' };

export default App;
