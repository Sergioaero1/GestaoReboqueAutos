import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, 
  ScrollView, Switch, Image, ActivityIndicator, StatusBar, Modal 
} from 'react-native';

import Constants from 'expo-constants';
import { initializeApp } from "firebase/app";
import { 
  initializeAuth, getReactNativePersistence, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, 
  onAuthStateChanged, signOut 
} from "firebase/auth";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
  apiKey: Constants.expoConfig.extra.firebaseApiKey,
  authDomain: Constants.expoConfig.extra.firebaseAuthDomain,
  projectId: Constants.expoConfig.extra.firebaseProjectId,
  storageBucket: Constants.expoConfig.extra.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig.extra.firebaseMessagingSenderId,
  appId: Constants.expoConfig.extra.firebaseAppId,
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });
const API_URL = Constants.expoConfig.extra.apiUrl;

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);

  // Estados Form
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [placaGuincho, setPlacaGuincho] = useState('');

  // Estados Operacionais
  const [rastreando, setRastreando] = useState(false);
  const [placaCliente, setPlacaCliente] = useState('');
  const [foto, setFoto] = useState(null);
  const [avaria, setAvaria] = useState('');
  const [checklistAberto, setChecklistAberto] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u && u.emailVerified) setUser(u);
      else setUser(null);
    });
  }, []);

  // Lógica GPS
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
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, senha);
      if (!res.user.emailVerified) {
        Alert.alert("Atenção", "Valide seu e-mail.");
        await signOut(auth);
      } else {
        await axios.post(`${API_URL}/motorista/sincronizar`, {
          firebase_uid: res.user.uid,
          email: res.user.email,
          nome: "Motorista Ativo",
          placa: "S/P"
        });
      }
    } catch (e) { Alert.alert("Erro", "Login falhou."); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, senha);
      await sendEmailVerification(res.user);
      await axios.post(`${API_URL}/motorista/registrar`, {
        firebase_uid: res.user.uid, nome, placa: placaGuincho
      });
      Alert.alert("Sucesso", "Confirme seu e-mail.");
      setView('login');
    } catch (e) { Alert.alert("Erro", e.message); }
    finally { setLoading(false); }
  };

  const tirarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Erro", "Sem câmera.");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!result.canceled) setFoto(result.assets[0].uri);
  };

  const enviarChecklist = async () => {
    if (!foto || !placaCliente) return Alert.alert("Erro", "Foto e placa são obrigatórios.");
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
    } catch (e) { Alert.alert("Erro", e.message); }
    finally { setLoading(false); }
  };

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.authContainer}>
        <Text style={styles.logoText}>Zétrikas Reboque</Text>
        {view === 'registro' && (
          <><TextInput style={styles.input} placeholder="Seu Nome" onChangeText={setNome} />
            <TextInput style={styles.input} placeholder="Placa do Guincho" onChangeText={setPlacaGuincho} /></>
        )}
        <TextInput style={styles.input} placeholder="E-mail" onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        {view !== 'recuperar' && <TextInput style={styles.input} placeholder="Senha" onChangeText={setSenha} secureTextEntry />}
        <TouchableOpacity style={styles.btnPrincipal} onPress={view === 'login' ? handleLogin : view === 'registro' ? handleRegister : () => sendPasswordResetEmail(auth, email)}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{view.toUpperCase()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setView(view === 'login' ? 'registro' : 'login')}><Text style={styles.linkText}>{view === 'login' ? "Cadastre-se" : "Voltar"}</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.mainContainer}>
        <View style={styles.header}>
          <Text style={styles.welcome}>Motorista: {user?.email}</Text>
          <TouchableOpacity onPress={() => signOut(auth)}><Text style={{color: 'red', fontWeight: 'bold'}}>Sair</Text></TouchableOpacity>
        </View>
        <View style={styles.cardRastreio}>
          <Text style={{fontWeight: 'bold'}}>RASTREIO GPS</Text>
          <Switch value={rastreando} onValueChange={setRastreando} />
        </View>
        <View style={styles.formChecklist}>
          <Text style={styles.label}>Novo Checklist</Text>
          <TextInput style={styles.input} placeholder="Placa do Cliente" value={placaCliente} onChangeText={(t) => setPlacaCliente(t.toUpperCase())} autoCapitalize="characters" maxLength={8} />
          <TouchableOpacity style={styles.btnCamera} onPress={tirarFoto}><Text style={{color: '#fff'}}>TIRAR FOTO 📸</Text></TouchableOpacity>
          {foto && <Image source={{ uri: foto }} style={styles.preview} />}
          <TextInput style={[styles.input, { height: 80 }]} placeholder="Avarias..." multiline onChangeText={setAvaria} value={avaria} />
          <TouchableOpacity style={[styles.btnEnviar, { opacity: loading ? 0.6 : 1 }]} onPress={enviarChecklist} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENVIAR CHECKLIST</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, marginTop: 20 },
  welcome: { fontSize: 12, fontWeight: '600' },
  cardRastreio: { backgroundColor: '#fff', padding: 20, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  formChecklist: { backgroundColor: '#fff', padding: 20, borderRadius: 10 },
  label: { fontWeight: 'bold', marginBottom: 15 },
  btnCamera: { backgroundColor: '#34495e', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  preview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10 },
  btnEnviar: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center' }
});
