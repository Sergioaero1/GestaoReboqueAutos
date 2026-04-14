const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'checklists_reboque',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage: storage });

// --- CONEXÃO COM O BANCO AIVEN (MYSQL) ---
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
        ca: fs.readFileSync(process.env.DB_SSL_CA),
        rejectUnauthorized: true
    }
});

db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err);
        return;
    }
    console.log('Conectado ao MySQL com sucesso! 🚀');
});

// --- ROTAS DO SISTEMA ---

// 1. Teste de API
app.get('/', (req, res) => res.send('API Zétrikas Reboque Online! 🏁'));

//2. Sincronizar Motorista  (para múltiplos usuários)
app.post('/motorista/sincronizar', (req, res) => {
    const { firebase_uid, nome, placa } = req.body;
    console.log("Tentando sincronizar UID:", firebase_uid);

    db.query('SELECT id FROM motoristas WHERE firebase_uid = ?', [firebase_uid], (err, results) => {
        if (err) return res.status(500).send(err);

        if (results.length > 0) {
            console.log("Motorista já existe no banco.");
            return res.send({ mensagem: "OK", id: results[0].id });
        } else {
            console.log("Criando novo registro para:", nome);
            const queryInsert = 'INSERT INTO motoristas (nome, placa_guincho, firebase_uid) VALUES (?, ?, ?)';
            db.query(queryInsert, [nome, placa, firebase_uid], (err, result) => {
                if (err) {
                    console.error("Erro ao inserir:", err);
                    return res.status(500).send(err);
                }
                res.send({ mensagem: "Criado", id: result.insertId });
            });
        }
    });
});


// 3. Atualizar Localização GPS
app.post('/rastreio/atualizar', (req, res) => {
    const { firebase_uid, latitude, longitude } = req.body;
    
    const query = 'UPDATE motoristas SET latitude = ?, longitude = ?, ultima_atualizacao = NOW() WHERE firebase_uid = ?';
    
    db.query(query, [latitude, longitude, firebase_uid], (err, result) => {
        if (err) return res.status(500).send(err);
        
        // Se o banco foi resetado e o UPDATE não afetou nada, tentamos sincronizar
        if (result.affectedRows === 0) {
            return res.status(404).send("Motorista precisa sincronizar");
        }
        res.send({ mensagem: "Localização atualizada!" });
    });
});

// 4. Painel Web: Listar Motoristas no Mapa
app.get('/rastreio/painel', (req, res) => {
    const query = 'SELECT id, nome, latitude, longitude, ultima_atualizacao, placa_guincho FROM motoristas';
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// 5. Enviar Checklist com Foto
app.post('/checklist/enviar', upload.single('foto'), (req, res) => {
    const { firebase_uid, placa_veiculo_cliente, tipo_avaria } = req.body;
    if (!req.file) return res.status(400).send("Sem foto.");

    db.query('SELECT id FROM motoristas WHERE firebase_uid = ?', [firebase_uid], (err, results) => {
        // O SEGREDO ESTÁ AQUI: results[0].id
        if (err || results.length === 0) return res.status(404).send("Motorista não achado.");

        const motorista_id = results[0].id; 
        const query = 'INSERT INTO checklists (motorista_id, placa_veiculo_cliente, url_foto_cloudinary, tipo_avaria) VALUES (?, ?, ?, ?)';
        
        db.query(query, [motorista_id, placa_veiculo_cliente, req.file.path, tipo_avaria], (err, result) => {
            if (err) return res.status(500).send(err);
            res.send({ mensagem: "Checklist salvo!", url: req.file.path });
        });
    });
});

// 6. Painel Web: Ver Relatório de Checklists
app.get('/checklists/relatorio', (req, res) => {
    const query = `
        SELECT c.*, m.nome as motorista_nome 
        FROM checklists c 
        JOIN motoristas m ON c.motorista_id = m.id 
        ORDER BY c.data_registro DESC`;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

app.listen(process.env.PORT, () => {
    console.log(`Servidor rodando na porta ${process.env.PORT}`);
});

// Rota para deletar motorista (Apenas o dono pode usar no Web)
app.delete('/motorista/deletar/:id', (req, res) => {
    const { id } = req.params;
    
    const query = 'DELETE FROM motoristas WHERE id = ?';
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Erro ao excluir motorista.");
        }
        res.send({ mensagem: "Motorista e todos os seus dados foram excluídos!" });
    });
});
