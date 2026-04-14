import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, 
  ScrollView, Switch, Image, ActivityIndicator, StatusBar,
  Modal // CORREÇÃO 1: Importando o Modal que estava faltando
} from 'react-native';

// Configurações e Firebase
import Constants from 'expo-constants';
import { initializeApp } from "firebase/app";
// CORREÇÃO 2: Importando ferramentas para persistência de login
import { 
  initializeAuth, 
  getReactNativePersistence,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  onAuthStateChanged, 
  signOut 
} from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Sensores e API
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

// --- CONFIGURAÇÃO PROTEGIDA ---
const firebaseConfig = {
  apiKey: Constants.expoConfig.extra.firebaseApiKey,
  authDomain: Constants.expoConfig.extra.firebaseAuthDomain,
  projectId: Constants.expoConfig.extra.firebaseProjectId,
  storageBucket: Constants.expoConfig.extra.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig.extra.firebaseMessagingSenderId,
  appId: Constants.expoConfig.extra.firebaseAppId,
};

const app = initializeApp(firebaseConfig);

// CORREÇÃO 3: Inicializando Auth com persistência para não deslogar ao fechar o app
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

const API_URL = Constants.expoConfig.extra.apiUrl;

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);

  // Estados Form Login/Registro
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [placaGuincho, setPlacaGuincho] = useState('');

  // Estados Operacionais
  const [rastreando, setRastreando] = useState(false);
  const [placaCliente, setPlacaCliente] = useState('');
  const [foto, setFoto] = useState(null);
  const [avaria, setAvaria] = useState('');
  const [checklistAberto, setChecklistAberto] = useState(null); // Estado para o Modal

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u && u.emailVerified) setUser(u);
      else setUser(null);
    });
  }, []);

  useEffect(() => {
    let watcher;
    const iniciarRastreio = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          axios.post(`${API_URL}/rastreio/atualizar`, {
            firebase_uid: user.uid,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          }).catch(e => console.log("Erro GPS:", e.message));
        }
      );
    };

    if (rastreando && user) iniciarRastreio();
    else if (watcher) watcher.remove();

    return () => watcher?.remove();
  }, [rastreando, user]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const res = await signInWithEmailAndPassword(auth, email, senha);
      if (!res.user.emailVerified) {
        Alert.alert("Verificação", "Por favor, valide seu e-mail antes de entrar.");
        await signOut(auth);
        setLoading(false);
        return;
      }
      await axios.post(`${API_URL}/motorista/sincronizar`, {
        firebase_uid: res.user.uid,
        email: res.user.email,
        nome: nome || "Motorista Ativo",
        placa: placaGuincho || "S/P"
      });
    } catch (e) { 
      Alert.alert("Erro", "E-mail ou senha inválidos."); 
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if(!nome || !placaGuincho) return Alert.alert("Erro", "Preencha Nome e Placa.");
    try {
      setLoading(true);
      const res = await createUserWithEmailAndPassword(auth, email, senha);
      await sendEmailVerification(res.user);
      await axios.post(`${API_URL}/motorista/registrar`, {
        firebase_uid: res.user.uid,
        nome,
        placa: placaGuincho
      });
      Alert.alert("Sucesso!", "Conta criada! Verifique seu e-mail para ativar.");
      setView('login');
    } catch (e) { Alert.alert("Erro", e.message); }
    finally { setLoading(false); }
  };

  const tirarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Erro", "Sem acesso à câmera.");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!result.canceled && result.assets) {
      setFoto(result.assets[0].uri);
    }
  };

  const enviarChecklist = async () => {
    if (!foto || !placaCliente) return Alert.alert("Erro", "Tire a foto e digite a placa do cliente.");
    setLoading(true);
    const fd = new FormData();
    fd.append('firebase_uid', user.uid);
    fd.append('placa_veiculo_cliente', placaCliente);
    fd.append('tipo_avaria', avaria);
    const uriParts = foto.split('.');
    const fileType = uriParts[uriParts.length - 1];
    fd.append('foto', { uri: foto, name: `photo.${fileType}`, type: `image/${fileType}` });

    try {
      await axios.post(`${API_URL}/checklist/enviar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      Alert.alert("Sucesso", "Checklist enviado!");
      setFoto(null); setAvaria(''); setPlacaCliente('');
    } catch (e) { Alert.alert("Erro no envio", e.message); }
    finally { setLoading(false); }
  };

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.authContainer}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.logoText}>Zétrikas Reboque</Text>
        {view === 'registro' && (
          <><TextInput style={styles.input} placeholder="Seu Nome" onChangeText={setNome} />
            <TextInput style={styles.input} placeholder="Placa do seu Guincho" onChangeText={setPlacaGuincho} /></>
        )}
        <TextInput style={styles.input} placeholder="E-mail" onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        {view !== 'recuperar' && <TextInput style={styles.input} placeholder="Senha" onChangeText={setSenha} secureTextEntry />}
        <TouchableOpacity style={styles.btnPrincipal} onPress={view === 'login' ? handleLogin : view === 'registro' ? handleRegister : () => sendPasswordResetEmail(auth, email)}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{view.toUpperCase()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setView(view === 'login' ? 'registro' : 'login')}>
          <Text style={styles.linkText}>{view === 'login' ? "Cadastre-se" : "Voltar para Login"}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.mainContainer}>
        <View style={styles.header}>
          <Text style={styles.welcome}>Motorista: {user.email}</Text>
          <TouchableOpacity onPress={() => signOut(auth)}><Text style={{color: 'red'}}>Sair</Text></TouchableOpacity>
        </View>
        <View style={styles.cardRastreio}>
          <Text style={{fontWeight: 'bold'}}>RASTREIO GPS</Text>
          <Switch value={rastreando} onValueChange={setRastreando} />
        </View>
        <View style={styles.formChecklist}>
          <Text style={styles.label}>Novo Checklist</Text>
          <TextInput style={styles.input} placeholder="Placa do Cliente" value={placaCliente} onChangeText={setPlacaCliente} />
          <TouchableOpacity style={styles.btnCamera} onPress={tirarFoto}>
            <Text style={{color: '#fff'}}>TIRAR FOTO 📸</Text>
          </TouchableOpacity>
          {foto && <Image source={{ uri: foto }} style={styles.preview} />}
          <TextInput style={[styles.input, { height: 80 }]} placeholder="Avarias..." multiline onChangeText={setAvaria} value={avaria} />
          <TouchableOpacity style={styles.btnEnviar} onPress={enviarChecklist}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENVIAR CHECKLIST</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={!!checklistAberto} animationType="slide" transparent={false}>
        <View style={{ flex: 1, padding: 20, paddingTop: 50 }}>
          <TouchableOpacity onPress={() => setChecklistAberto(null)} style={styles.btnVoltar}>
            <Text style={{color: '#fff', fontWeight: 'bold'}}>VOLTAR</Text>
          </TouchableOpacity>
          <Image source={{ uri: checklistAberto?.url_foto_cloudinary }} style={styles.imgGrande} resizeMode="contain" />
          <Text style={styles.modalTitle}>Placa: {checklistAberto?.placa_veiculo_cliente}</Text>
          <ScrollView style={styles.scrollDesc}>
            <Text style={styles.modalDesc}>{checklistAberto?.tipo_avaria}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  authContainer: { flexGrow: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
  logoText: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#2c3e50' },
  input: { backgroundColor: '#f1f2f6', padding: 15, borderRadius: 10, marginBottom: 12 },
  btnPrincipal: { backgroundColor: '#3498db', padding: 18, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  linkText: { textAlign: 'center', marginTop: 20, color: '#3498db' },
  mainContainer: { padding: 40, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  welcome: { fontSize: 13, fontWeight: '600' },
  cardRastreio: { backgroundColor: '#fff', padding: 20, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  formChecklist: { backgroundColor: '#fff', padding: 20, borderRadius: 10 },
  label: { fontWeight: 'bold', marginBottom: 15 },
  btnCamera: { backgroundColor: '#34495e', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  preview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10 },
  btnEnviar: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnVoltar: { backgroundColor: '#e74c3c', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  imgGrande: { width: '100%', height: 300, borderRadius: 10, backgroundColor: '#000' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginVertical: 15, color: '#2c3e50' },
  scrollDesc: { backgroundColor: '#f1f2f6', padding: 15, borderRadius: 8, flex: 1 },
  modalDesc: { fontSize: 16, color: '#34495e', lineHeight: 24 }
});



// import React, { useState, useEffect } from 'react';
// import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, Switch, Image, ActivityIndicator, StatusBar, modal } from 'react-native';

// // Configurações e Firebase
// import Constants from 'expo-constants';
// import { initializeApp } from "firebase/app";
// import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut } from "firebase/auth";

// // Sensores e API
// import * as Location from 'expo-location';
// import * as ImagePicker from 'expo-image-picker';
// import axios from 'axios';

// // --- CONFIGURAÇÃO PROTEGIDA (Vem do seu app.config.js / .env) ---
// const firebaseConfig = {
//   apiKey: Constants.expoConfig.extra.firebaseApiKey,
//   authDomain: Constants.expoConfig.extra.firebaseAuthDomain,
//   projectId: Constants.expoConfig.extra.firebaseProjectId,
//   storageBucket: Constants.expoConfig.extra.firebaseStorageBucket,
//   messagingSenderId: Constants.expoConfig.extra.firebaseMessagingSenderId,
//   appId: Constants.expoConfig.extra.firebaseAppId,
// };

// const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const API_URL = Constants.expoConfig.extra.apiUrl;

// export default function App() {
//   // Estados de Autenticação
//   const [user, setUser] = useState(null);
//   const [view, setView] = useState('login'); // login, registro, recuperar
//   const [loading, setLoading] = useState(false);

//   // Estados Form Login/Registro
//   const [email, setEmail] = useState('');
//   const [senha, setSenha] = useState('');
//   const [nome, setNome] = useState('');
//   const [placaGuincho, setPlacaGuincho] = useState('');

//   // Estados Operacionais (GPS e Checklist)
//   const [rastreando, setRastreando] = useState(false);
//   const [placaCliente, setPlacaCliente] = useState(''); // Placa do carro rebocado
//   const [foto, setFoto] = useState(null);
//   const [avaria, setAvaria] = useState('');

//   // 1. Monitor de Estado do Usuário
//   useEffect(() => {
//     return onAuthStateChanged(auth, (u) => {
//       if (u && u.emailVerified) setUser(u);
//       else setUser(null);
//     });
//   }, []);

//   // 2. Lógica do GPS em Tempo Real
//   useEffect(() => {
//     let watcher;
//     const iniciarRastreio = async () => {
//       let { status } = await Location.requestForegroundPermissionsAsync();
//       if (status !== 'granted') return;

//       watcher = await Location.watchPositionAsync(
//         { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
//         (loc) => {
//           axios.post(`${API_URL}/rastreio/atualizar`, {
//             firebase_uid: user.uid,
//             latitude: loc.coords.latitude,
//             longitude: loc.coords.longitude
//           }).catch(e => console.log("Erro GPS:", e.message));
//         }
//       );
//     };

//     if (rastreando && user) iniciarRastreio();
//     else if (watcher) watcher.remove();

//     return () => watcher?.remove();
//   }, [rastreando, user]);

//   // --- FUNÇÕES DE AUTH ---

//   const handleLogin = async () => {
//     try {
//       setLoading(true);
//       const res = await signInWithEmailAndPassword(auth, email, senha);
      
//       if (!res.user.emailVerified) {
//         Alert.alert("Verificação", "Por favor, valide seu e-mail antes de entrar.");
//         await signOut(auth);
//         setLoading(false);
//         return;
//       }

//       // SINCRONIZAÇÃO: Garante que o motorista exista no MySQL após o login
//       await axios.post(`${API_URL}/motorista/sincronizar`, {
//         firebase_uid: res.user.uid,
//         email: res.user.email,
//         nome: nome || "Motorista Ativo",
//         placa: placaGuincho || "S/P"
//       });

//     } catch (e) { 
//       Alert.alert("Erro", "E-mail ou senha inválidos."); 
//     } finally {
//       setLoading(false);
//     }
//   };

//     const handleRegister = async () => {
//     if (!nome || !placaGuincho) {
//       return Alert.alert("Campos Obrigatórios", "Por favor, preencha seu nome e a placa do guincho.");
//     }

//     try {
//       setLoading(true);
      
//       // 1. Cria o usuário no Firebase
//       const res = await createUserWithEmailAndPassword(auth, email, senha);
      
//       // 2. Envia o e-mail de verificação
//       await sendEmailVerification(res.user);
      
//       // 3. Tenta registrar no seu MySQL (Node.js)
//       // Usamos um try/catch interno aqui para que, se o servidor falhar, 
//       // o usuário ainda receba o aviso do e-mail.
//       try {
//         await axios.post(`${API_URL}/motorista/registrar`, {
//           firebase_uid: res.user.uid,
//           nome: nome,
//           placa: placaGuincho
//         });
//       } catch (nodeError) {
//         console.log("Erro ao salvar no MySQL, mas conta Firebase criada:", nodeError.message);
//       }

//       // 4. Mensagem Profissional de Sucesso
//       Alert.alert(
//         "Verificação Necessária",
//         "Sua conta foi pré-cadastrada com sucesso! Enviamos um link de confirmação para o seu e-mail. Por favor, valide sua conta para liberar o acesso ao sistema.",
//         [{ text: "OK", onPress: () => setView('login') }]
//       );

//     } catch (e) {
//       // Tratamento de erros comuns do Firebase
//       let mensagemErro = "Não foi possível realizar o cadastro.";
//       if (e.code === 'auth/email-already-in-use') mensagemErro = "Este e-mail já está cadastrado.";
//       if (e.code === 'auth/weak-password') mensagemErro = "A senha deve ter pelo menos 6 caracteres.";
      
//       Alert.alert("Erro no Cadastro", mensagemErro);
//     } finally {
//       setLoading(false);
//     }
//   };

//      // --- FUNÇÕES DE CHECKLIST ---
  
//   const tirarFoto = async () => {
//     // 1. Pede permissão para a câmera
//     const { status } = await ImagePicker.requestCameraPermissionsAsync();
//     if (status !== 'granted') {
//       Alert.alert("Erro", "Precisamos de acesso à câmera para o checklist.");
//       return;
//     }

//     // 2. Abre a câmera
//     let result = await ImagePicker.launchCameraAsync({
//       allowsEditing: true,
//       aspect: [4, 3],
//       quality: 0.5, // Reduz o peso da imagem para o upload ser rápido
//     });

//     // 3. Verifica se o usuário não cancelou e extrai a URI correta
//     if (!result.canceled && result.assets && result.assets.length > 0) {
//       const uriEncontrada = result.assets[0].uri;
//       setFoto(uriEncontrada);
//       console.log("Foto capturada com sucesso:", uriEncontrada);
//     }
//   };

//   const enviarChecklist = async () => {
//     // Validação rigorosa: Foto existe? Placa foi digitada?
//     if (!foto) {
//       return Alert.alert("Atenção", "É obrigatório tirar uma foto do veículo.");
//     }
//     if (!placaCliente || placaCliente.trim() === "") {
//       return Alert.alert("Atenção", "Digite a placa do veículo do cliente.");
//     }
    
//     setLoading(true);
//     const fd = new FormData();
    
//     // Dados textuais
//     fd.append('firebase_uid', user.uid);
//     fd.append('placa_veiculo_cliente', placaCliente.trim().toUpperCase()); 
//     fd.append('tipo_avaria', avaria || "Nenhuma observação informada.");
    
//     // Tratamento da Imagem para o Multer (Backend)
//     const filename = foto.split('/').pop(); // Extrai o nome do arquivo da URI
//     const match = /\.(\w+)$/.exec(filename);
//     const type = match ? `image/${match[1]}` : `image/jpg`;

//     fd.append('foto', { 
//       uri: foto, 
//       name: filename, 
//       type: type 
//     });

//     try {
//       await axios.post(`${API_URL}/checklist/enviar`, fd, { 
//         headers: { 'Content-Type': 'multipart/form-data' } 
//       });
      
//       Alert.alert("Sucesso!", "Checklist e foto foram enviados para o sistema.");
      
//       // Limpa os campos após o envio bem-sucedido
//       setFoto(null); 
//       setAvaria(''); 
//       setPlacaCliente('');
      
//     } catch (e) { 
//       console.log("Erro no envio do checklist:", e.message);
//       Alert.alert("Erro no envio", "Verifique sua conexão com a internet ou se o servidor está ligado."); 
//     } finally {
//       setLoading(false);
//     }
//   };


//   // --- RENDERS ---
//   if (!user) {
//     return (
//       <ScrollView contentContainerStyle={styles.authContainer}>
//         <StatusBar barStyle="dark-content" />
//         <Text style={styles.logoText}>Zétrikas Reboque</Text>
        
//         {view === 'registro' && (
//           <><TextInput style={styles.input} placeholder="Seu Nome" onChangeText={setNome} />
//             <TextInput style={styles.input} placeholder="Placa do seu Guincho" onChangeText={setPlacaGuincho} /></>
//         )}
        
//         <TextInput style={styles.input} placeholder="E-mail" onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
//         {view !== 'recuperar' && <TextInput style={styles.input} placeholder="Senha" onChangeText={setSenha} secureTextEntry />}

//         <TouchableOpacity style={styles.btnPrincipal} onPress={view === 'login' ? handleLogin : view === 'registro' ? handleRegister : () => sendPasswordResetEmail(auth, email)}>
//           {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{view.toUpperCase()}</Text>}
//         </TouchableOpacity>

//         <TouchableOpacity onPress={() => setView(view === 'login' ? 'registro' : 'login')}>
//           <Text style={styles.linkText}>{view === 'login' ? "Não tem conta? Cadastre-se" : "Voltar para Login"}</Text>
//         </TouchableOpacity>
//       </ScrollView>
//     );
//   }

//     return (
//     <View style={{ flex: 1 }}>
//       <StatusBar barStyle="dark-content" />
      
//       <ScrollView contentContainerStyle={styles.mainContainer}>
//         <View style={styles.header}>
//           <Text style={styles.welcome}>Motorista: {user.email}</Text>
//           <TouchableOpacity onPress={() => signOut(auth)}>
//             <Text style={{ color: 'red', fontWeight: 'bold' }}>Sair</Text>
//           </TouchableOpacity>
//         </View>

//         <View style={styles.cardRastreio}>
//           <Text style={{ fontWeight: 'bold' }}>RASTREIO GPS</Text>
//           <Switch value={rastreando} onValueChange={setRastreando} />
//         </View>

//         <View style={styles.formChecklist}>
//           <Text style={styles.label}>Novo Checklist do Carro</Text>
//           <TextInput 
//             style={styles.input} 
//             placeholder="Placa do Veículo do Cliente" 
//             value={placaCliente} 
//             onChangeText={setPlacaCliente} 
//           />
          
//           <TouchableOpacity style={styles.btnCamera} onPress={tirarFoto}>
//             <Text style={{ color: '#fff' }}>{foto ? "TROCAR FOTO 📸" : "TIRAR FOTO 📸"}</Text>
//           </TouchableOpacity>
          
//           {foto && <Image source={{ uri: foto }} style={styles.preview} />}
          
//           <TextInput 
//             style={[styles.input, { height: 80 }]} 
//             placeholder="Descreva avarias ou observações..." 
//             multiline 
//             onChangeText={setAvaria} 
//             value={avaria} 
//           />
          
//           <TouchableOpacity 
//             style={[styles.btnEnviar, { opacity: loading ? 0.6 : 1 }]} 
//             onPress={enviarChecklist}
//             disabled={loading}
//           >
//             {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENVIAR CHECKLIST</Text>}
//           </TouchableOpacity>
//         </View>
//       </ScrollView>

//       {/* MODAL DE DETALHES - FICA FORA DO SCROLLVIEW PARA COBRIR A TELA TODA */}
//       <Modal visible={!!checklistAberto} animationType="slide" transparent={false}>
//         <View style={{ flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#fff' }}>
//           <TouchableOpacity 
//             onPress={() => setChecklistAberto(null)} 
//             style={styles.btnVoltar}
//           >
//             <Text style={{ color: '#fff', fontWeight: 'bold' }}>VOLTAR AO PAINEL</Text>
//           </TouchableOpacity>
          
//           {checklistAberto?.url_foto_cloudinary && (
//             <Image 
//               source={{ uri: checklistAberto.url_foto_cloudinary }} 
//               style={styles.imgGrande} 
//               resizeMode="contain"
//             />
//           )}
          
//           <Text style={styles.modalTitle}>Placa: {checklistAberto?.placa_veiculo_cliente}</Text>
          
//           <ScrollView style={styles.scrollDesc}>
//             <Text style={styles.modalDesc}>
//               {checklistAberto?.tipo_avaria || "Sem descrição informada."}
//             </Text>
//           </ScrollView>
//         </View>
//       </Modal>
//     </View>
//   );
// }


// const styles = StyleSheet.create({
//   authContainer: { flexGrow: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
//   logoText: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#2c3e50' },
//   input: { backgroundColor: '#f1f2f6', padding: 15, borderRadius: 10, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#ddd' },
//   btnPrincipal: { backgroundColor: '#3498db', padding: 18, borderRadius: 10, alignItems: 'center' },
//   btnText: { color: '#fff', fontWeight: 'bold' },
//   linkText: { textAlign: 'center', marginTop: 20, color: '#3498db' },
//   mainContainer: { padding: 40, backgroundColor: '#f8f9fa' },
//   header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
//   welcome: { fontSize: 13, fontWeight: '600' },
//   cardRastreio: { backgroundColor: '#fff', padding: 20, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, elevation: 2 },
//   formChecklist: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2 },
//   label: { fontWeight: 'bold', marginBottom: 15, fontSize: 16 },
//   btnCamera: { backgroundColor: '#34495e', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
//   preview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10 },
//   btnEnviar: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center' }
// });