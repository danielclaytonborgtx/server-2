"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("@fastify/cors"));
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const fastify_1 = __importDefault(require("fastify"));
const joi_1 = __importDefault(require("joi"));
const google_auth_library_1 = require("google-auth-library");
const multipart_1 = __importDefault(require("@fastify/multipart"));
const static_1 = __importDefault(require("@fastify/static"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pump_1 = __importDefault(require("pump"));
const server = (0, fastify_1.default)();
const prisma = new client_1.PrismaClient();
const client = new google_auth_library_1.OAuth2Client('468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com');
server.register(multipart_1.default, {
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10,
    },
});
const uploadsPath = path_1.default.join(__dirname, '../uploads');
// Registra o plugin para servir arquivos estáticos
server.register(static_1.default, {
    root: uploadsPath,
    prefix: '/uploads/', // URL base para acessar os arquivos
});
// Habilitar CORS
server.register(cors_1.default, {
    origin: "*", // Ajuste conforme necessário
});
// Esquemas de validação
const registerSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    username: joi_1.default.string().min(3).max(30).required(),
    password: joi_1.default.string().min(6).required(),
});
const loginSchema = joi_1.default.object({
    username: joi_1.default.string().min(3).max(30).required(),
    password: joi_1.default.string().min(6).required(),
});
const propertySchema = joi_1.default.object({
    title: joi_1.default.string().required(),
    description: joi_1.default.string().required(),
    description1: joi_1.default.string().required(),
    price: joi_1.default.number().required(),
    latitude: joi_1.default.number().required(),
    longitude: joi_1.default.number().required(),
    category: joi_1.default.string().valid('Venda', 'Aluguel').required(),
    userId: joi_1.default.number().required(),
    images: joi_1.default.array().min(1).required(),
});
const messageSchema = joi_1.default.object({
    senderId: joi_1.default.number().required(), // Id do remetente
    receiverId: joi_1.default.number().required(), // Id do destinatário
    content: joi_1.default.string().min(1).required(), // Conteúdo da mensagem
});
const teamSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    members: joi_1.default.array().items(joi_1.default.number().integer().required()).min(1).required(),
    imageUrl: joi_1.default.string().uri().optional(), // Validação para a URL da imagem, caso fornecida
});
// Rota de registro de usuários
server.post("/users", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Requisição recebida:", request.body); // Log da entrada
    const { error } = registerSchema.validate(request.body);
    if (error) {
        console.error("Erro de validação:", error.details[0].message);
        return reply.status(400).send({ error: error.details[0].message });
    }
    const { name, email, username, password } = request.body;
    try {
        console.log("Verificando usuário existente...");
        const existingUser = yield prisma.user.findUnique({
            where: { username },
        });
        if (existingUser) {
            console.error("Username já utilizado:", username);
            return reply.status(409).send({ error: "Username já utilizado" });
        }
        console.log("Hashing da senha...");
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        console.log("Criando usuário...");
        const user = yield prisma.user.create({
            data: {
                name,
                email,
                username,
                password: hashedPassword,
            },
        });
        console.log("Usuário criado com sucesso:", user);
        return reply.status(201).send({ user });
    }
    catch (error) {
        console.error("Erro ao criar usuário:", error);
        return reply.status(500).send({ error: "Falha ao criar usuário" });
    }
}));
// Rota de login via usuário e senha
server.post("/session", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { error } = loginSchema.validate(request.body);
    if (error) {
        return reply.status(400).send({ error: error.details[0].message });
    }
    const { username, password } = request.body;
    try {
        const user = yield prisma.user.findUnique({ where: { username } });
        console.log("Usuário encontrado:", user);
        if (!user || !(yield bcrypt_1.default.compare(password, user.password))) {
            console.error("Erro: Usuário ou senha inválidos");
            return reply.status(401).send({ error: "Invalid username or password" });
        }
        // Garantir que o campo picture seja tratado como opcional
        return reply.send({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                picture: user.picture || null, // Definir como null se não houver imagem
            },
        });
    }
    catch (error) {
        console.error("Erro ao fazer login:", error);
        return reply.status(500).send({ error: "Falha ao fazer login" });
    }
}));
// Rota para atualizar a imagem de perfil do usuário
server.post("/users/:id/profile-picture", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    try {
        const parts = request.parts(); // Processa arquivos e campos multipart
        let profilePictureUrl = ""; // Variável para armazenar a URL da imagem de perfil
        try {
            // Processar as partes da requisição
            for (var _d = true, parts_1 = __asyncValues(parts), parts_1_1; parts_1_1 = yield parts_1.next(), _a = parts_1_1.done, !_a; _d = true) {
                _c = parts_1_1.value;
                _d = false;
                const part = _c;
                if (part.type === "file") {
                    // Garante que o nome do arquivo seja único usando timestamp
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join("uploads", fileName); // Diretório 'uploads/'
                    // Gera a URL pública que pode ser acessada
                    profilePictureUrl = `/uploads/${fileName}`.replace(/\/+/g, "/"); // Elimina múltiplos "/"
                    console.log("URL gerada:", profilePictureUrl);
                    // Faz o upload do arquivo para o diretório "uploads/"
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parts_1.return)) yield _b.call(parts_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        // Verifica se a URL da imagem foi gerada
        if (!profilePictureUrl) {
            return reply.status(400).send({ error: "Imagem de perfil não fornecida." });
        }
        // Atualiza a imagem de perfil do usuário no banco de dados
        const updatedUser = yield prisma.user.update({
            where: { id: Number(request.params.id) },
            data: {
                picture: profilePictureUrl, // Atualiza o campo "picture" com a URL da imagem
            },
        });
        return reply.status(200).send({ message: "Imagem de perfil atualizada com sucesso", user: updatedUser });
    }
    catch (err) {
        console.error("Erro ao atualizar imagem de perfil:", err);
        return reply.status(500).send({ error: "Falha ao atualizar a imagem de perfil. Tente novamente." });
    }
}));
// Rota para obter a imagem de perfil do usuário
server.get("/users/:id/profile-picture", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Busca o usuário no banco de dados
        const user = yield prisma.user.findUnique({
            where: { id: Number(request.params.id) },
        });
        // Verifica se o usuário existe
        if (!user) {
            return reply.status(404).send({ error: "Usuário não encontrado." });
        }
        // Se não houver imagem de perfil, retorna uma URL padrão (ou null)
        const pictureUrl = user.picture || null;
        // Retorna a URL da imagem de perfil ou null
        return reply.status(200).send({
            user: {
                picture: pictureUrl, // URL da imagem de perfil ou null
            },
        });
    }
    catch (err) {
        return reply.status(500).send({ error: "Falha ao carregar imagem de perfil." });
    }
}));
// Rota de login com Google (ID Token)
server.post("/google-login", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { id_token } = request.body;
    try {
        // Verificar o ID token do Google usando o client OAuth2Client
        const ticket = yield client.verifyIdToken({
            idToken: id_token,
            audience: '468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com', // ID do cliente Google
        });
        const payload = ticket.getPayload();
        if (payload && payload.email && payload.name) {
            // Gerar uma senha temporária ou aleatória
            const tempPassword = Math.random().toString(36).slice(-8);
            // Verifique ou crie um usuário baseado no payload do Google
            const user = yield prisma.user.upsert({
                where: { email: payload.email },
                update: {},
                create: {
                    email: payload.email,
                    username: payload.email,
                    name: payload.name,
                    picture: payload.picture || '', // Defina uma string vazia se a imagem estiver indefinida
                    password: yield bcrypt_1.default.hash(tempPassword, 10),
                },
            });
            return reply.send({ message: "Login successful", user });
        }
        return reply.status(400).send({ error: 'Google login failed: informações incompletas' });
    }
    catch (error) {
        console.error('Erro ao autenticar com o Google:', error);
        return reply.status(500).send({ error: 'Erro no login com o Google' });
    }
}));
// Rota de buscar todos usuários
server.get('/users', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield prisma.user.findMany(); // Busca todos os usuários no banco
        return reply.send(users);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Failed to fetch users' });
    }
}));

server.get('/users/no-team', async (request, reply) => {
    console.log('Rota /users/no-team acessada'); // Log de acesso à rota
    try {
      const users = await prisma.user.findMany({
        where: {
          teamMemberships: {
            none: {}
          },
        },
      });
      console.log('Usuários sem equipe encontrados:', users); // Log dos usuários encontrados
      return reply.send(users);
    } catch (error) {
      console.error('Erro na rota /users/no-team:', error); // Log de erro
      return reply.status(500).send({ error: 'Falha ao buscar usuários sem equipe' });
    }
  });

// Rota de buscar usuário por ID e username
server.get('/users/:identifier', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { identifier } = request.params;
    try {
        let user;
        // Se for um número, busca pelo ID
        if (!isNaN(Number(identifier))) {
            user = yield prisma.user.findUnique({ where: { id: Number(identifier) } });
        }
        else {
            // Se for string, busca pelo username
            user = yield prisma.user.findUnique({ where: { username: identifier } });
        }
        if (!user) {
            return reply.status(404).send({ error: 'Usuário não encontrado' });
        }
        return reply.send(user);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Failed to fetch user' });
    }
}));
// Rota para criar equipes
server.post("/team", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_2, _b, _c;
    try {
        const parts = request.parts(); // Processa arquivos e campos multipart
        let teamImageUrl = "";
        let teamName = "";
        let members = [];
        console.log("🔄 Iniciando processamento do request...");
        try {
            for (var _d = true, parts_2 = __asyncValues(parts), parts_2_1; parts_2_1 = yield parts_2.next(), _a = parts_2_1.done, !_a; _d = true) {
                _c = parts_2_1.value;
                _d = false;
                const part = _c;
                console.log("📦 Processando parte:", part.fieldname);
                if (part.type === "file") {
                    console.log("🖼️ Recebendo arquivo:", part.filename);
                    const uploadDir = path_1.default.join(__dirname, '../uploads'); // Caminho correto para a pasta uploads na raiz
                    if (!fs_1.default.existsSync(uploadDir)) {
                        fs_1.default.mkdirSync(uploadDir, { recursive: true });
                    }
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join(uploadDir, fileName);
                    teamImageUrl = `/uploads/${fileName}`.replace(/\/+/g, "/"); // Ajustando a URL para a pasta correta
                    console.log("📂 Salvando arquivo em:", filePath);
                    console.log("🌐 URL gerada:", teamImageUrl);
                    // Verifique se o arquivo está sendo gravado corretamente
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                    console.log("✅ Arquivo salvo com sucesso!");
                }
                else if (part.fieldname === "name") {
                    teamName = typeof part.value === "string" ? part.value : String(part.value);
                    console.log("📛 Nome da equipe recebido:", teamName);
                }
                else if (part.fieldname === "members") {
                    try {
                        const parsedMembers = JSON.parse(String(part.value)); // Parse do campo 'members' como JSON
                        if (Array.isArray(parsedMembers)) {
                            members = parsedMembers.map((id) => Number(id));
                            console.log("👥 Membros recebidos:", members);
                        }
                    }
                    catch (err) {
                        console.error("❌ Erro ao processar membros:", err);
                        return reply.status(400).send({ error: "Formato de membros inválido." });
                    }
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parts_2.return)) yield _b.call(parts_2);
            }
            finally { if (e_2) throw e_2.error; }
        }
        // Verificação dos campos obrigatórios
        if (!teamName || members.length === 0) {
            console.error("❌ Erro: Nome da equipe e membros são obrigatórios.");
            return reply.status(400).send({ error: "Nome da equipe e membros são obrigatórios." });
        }
        console.log("🛠️ Criando equipe no banco de dados...");
        const newTeam = yield prisma.team.create({
            data: { name: teamName, imageUrl: teamImageUrl },
        });
        console.log("🛠️ Associando membros à equipe...");
        yield prisma.teamMember.createMany({
            data: members.map((userId) => ({
                teamId: newTeam.id,
                userId,
            })),
        });
        console.log("🎉 Equipe criada com sucesso!", newTeam);
        return reply.status(201).send({ message: "Equipe criada com sucesso!", team: newTeam });
    }
    catch (err) {
        console.error("❌ Erro ao criar equipe:", err);
        return reply.status(500).send({ error: "Falha ao criar equipe. Tente novamente." });
    }
}));
// Rota para ver equipe
server.get('/team', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = request.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return reply.status(400).send({ error: 'Usuário não autenticado ou ID não encontrado.' });
        }
        const team = yield prisma.team.findFirst({
            where: {
                members: {
                    some: { userId: userId },
                },
            },
            include: {
                members: true,
            },
        });
        if (!team) {
            return reply.status(404).send({ error: 'Equipe não encontrada' });
        }
        reply.status(200).send(team);
    }
    catch (error) { // Agora, o tipo do erro é `unknown`
        if (error instanceof Error) {
            console.error('Erro ao buscar a equipe:', error.message); // Agora TypeScript sabe que é uma instância de Error
            reply.status(500).send({ error: 'Erro ao buscar a equipe', details: error.message });
        }
        else {
            // Caso o erro não seja uma instância de Error
            console.error('Erro desconhecido:', error);
            reply.status(500).send({ error: 'Erro ao buscar a equipe' });
        }
    }
}));
// Rota para editar uma equipe existente
server.put('/team/:id', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_3, _b, _c;
    try {
        const teamId = parseInt(request.params.id); // Convertendo id para número
        if (isNaN(teamId)) {
            return reply.status(400).send({ error: 'ID inválido.' });
        }
        const parts = request.parts(); // Processa arquivos e campos multipart
        let teamImageUrl;
        let teamName;
        let members;
        console.log('🔄 Iniciando atualização da equipe...');
        try {
            for (var _d = true, parts_3 = __asyncValues(parts), parts_3_1; parts_3_1 = yield parts_3.next(), _a = parts_3_1.done, !_a; _d = true) {
                _c = parts_3_1.value;
                _d = false;
                const part = _c;
                console.log('📦 Processando parte:', part.fieldname);
                if (part.type === 'file') {
                    console.log('🖼️ Recebendo novo arquivo:', part.filename);
                    const uploadDir = path_1.default.join(__dirname, '../uploads');
                    if (!fs_1.default.existsSync(uploadDir)) {
                        fs_1.default.mkdirSync(uploadDir, { recursive: true });
                    }
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join(uploadDir, fileName);
                    teamImageUrl = `/uploads/${fileName}`.replace(/\/+/g, '/');
                    console.log('📂 Salvando novo arquivo em:', filePath);
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                    console.log('✅ Novo arquivo salvo com sucesso!');
                }
                else if (part.fieldname === 'name') {
                    teamName = typeof part.value === 'string' ? part.value : String(part.value);
                    console.log('📛 Novo nome da equipe recebido:', teamName);
                }
                else if (part.fieldname === 'members') {
                    try {
                        const parsedMembers = JSON.parse(String(part.value));
                        if (Array.isArray(parsedMembers)) {
                            members = parsedMembers.map((id) => Number(id));
                            console.log('👥 Novos membros recebidos:', members);
                        }
                    }
                    catch (err) {
                        console.error('❌ Erro ao processar membros:', err);
                        return reply.status(400).send({ error: 'Formato de membros inválido.' });
                    }
                }
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parts_3.return)) yield _b.call(parts_3);
            }
            finally { if (e_3) throw e_3.error; }
        }
        // Verifica se a equipe existe
        const existingTeam = yield prisma.team.findUnique({
            where: { id: teamId },
        });
        if (!existingTeam) {
            console.error('❌ Erro: Equipe não encontrada.');
            return reply.status(404).send({ error: 'Equipe não encontrada.' });
        }
        console.log('🛠️ Atualizando equipe no banco de dados...');
        const updatedTeam = yield prisma.team.update({
            where: { id: teamId },
            data: {
                name: teamName || existingTeam.name,
                imageUrl: teamImageUrl || existingTeam.imageUrl,
            },
        });
        if (members) {
            console.log('🔄 Atualizando membros da equipe...');
            yield prisma.teamMember.deleteMany({ where: { teamId } });
            yield prisma.teamMember.createMany({
                data: members.map((userId) => ({
                    teamId,
                    userId,
                })),
            });
        }
        console.log('✅ Equipe atualizada com sucesso!', updatedTeam);
        return reply.status(200).send({ message: 'Equipe atualizada com sucesso!', team: updatedTeam });
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('❌ Erro ao atualizar equipe:', error.message);
            return reply.status(500).send({ error: 'Falha ao atualizar equipe.', details: error.message });
        }
        else {
            console.error('❌ Erro desconhecido:', error);
            return reply.status(500).send({ error: 'Erro ao atualizar equipe.' });
        }
    }
}));
server.get('/team/:id', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = parseInt(request.params.id); // Convertendo id para número
        if (isNaN(teamId)) {
            return reply.status(400).send({ error: 'ID inválido.' });
        }
        const team = yield prisma.team.findUnique({
            where: {
                id: teamId,
            },
            include: {
                members: {
                    include: {
                        user: true, // Incluir os dados do usuário para cada membro
                    },
                },
            },
        });
        if (!team) {
            return reply.status(404).send({ error: 'Equipe não encontrada.' });
        }
        // Enviar a resposta com os dados da equipe, incluindo a imagem e os membros
        reply.status(200).send({
            id: team.id,
            name: team.name,
            imageUrl: team.imageUrl, // Certificando-se de enviar a URL da imagem
            members: team.members.map(member => ({
                id: member.user.id,
                name: member.user.name,
                email: member.user.email,
                // Adicione outros dados de usuário que forem necessários
            })),
        });
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Erro ao buscar a equipe:', error.message);
            reply.status(500).send({ error: 'Erro ao buscar a equipe', details: error.message });
        }
        else {
            console.error('Erro desconhecido:', error);
            reply.status(500).send({ error: 'Erro ao buscar a equipe' });
        }
    }
}));
// Rota para buscar todas as equipes
server.get('/teams', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teams = yield prisma.team.findMany({
            include: {
                members: {
                    include: {
                        user: true,
                    },
                },
            },
        });
        return reply.send(teams);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Erro ao buscar todas as equipes' });
    }
}));

// Rota para deletar equipe
server.delete('/team/:id', async (request, reply) => {
    try {
      const teamId = Number(request.params.id);
      if (isNaN(teamId)) {
        return reply.status(400).send({ error: 'ID inválido.' });
      }
  
      console.log(`Tentando excluir a equipe com ID: ${teamId}`);
  
      // Verifica se o time existe antes de deletar
      const existingTeam = await prisma.team.findUnique({
        where: { id: teamId },
      });
  
      if (!existingTeam) {
        console.error(`Equipe com ID ${teamId} não encontrada.`);
        return reply.status(404).send({ error: 'Equipe não encontrada.' });
      }
  
      // Primeiro, deletamos os registros relacionados em TeamMember
      await prisma.teamMember.deleteMany({
        where: { teamId: teamId },
      });
  
      console.log(`Membros da equipe ${teamId} deletados.`);
  
      // Agora, podemos deletar a equipe
      await prisma.team.delete({
        where: { id: teamId },
      });
  
      console.log(`Equipe com ID ${teamId} excluída com sucesso.`);
      reply.status(200).send({ message: 'Equipe deletada com sucesso.' });
  
    } catch (error) {
      if (error instanceof Error) {
        console.error('Erro ao deletar a equipe:', error.message);
        reply.status(500).send({ error: 'Erro ao deletar a equipe', details: error.message });
      } else {
        console.error('Erro desconhecido:', error);
        reply.status(500).send({ error: 'Erro ao deletar a equipe' });
      }
    }
  });

// Rota para enviar mensagem
server.post('/messages', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { senderId, receiverId, content } = request.body;
    // Validando os dados com Joi
    const { error } = messageSchema.validate({ senderId, receiverId, content });
    if (error) {
        return reply.status(400).send({ error: error.details[0].message });
    }
    try {
        // Criando a nova mensagem
        const newMessage = yield prisma.message.create({
            data: {
                senderId,
                receiverId,
                content,
            },
        });
        return reply.status(201).send(newMessage);
    }
    catch (err) {
        console.error(err);
        return reply.status(500).send({ error: 'Falha ao enviar a mensagem.' });
    }
}));
// Rota para buscar mensagens entre dois usuários
server.get('/messages', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { senderId, receiverId } = request.query;
    // Convertendo para número
    const senderIdNum = parseInt(senderId, 10);
    const receiverIdNum = parseInt(receiverId, 10);
    // Validar se senderId e receiverId são números
    if (isNaN(senderIdNum) || isNaN(receiverIdNum)) {
        return reply.status(400).send({ error: 'Os parâmetros senderId e receiverId precisam ser números válidos.' });
    }
    try {
        // Consultar mensagens entre senderId e receiverId
        const messages = yield prisma.message.findMany({
            where: {
                OR: [
                    { senderId: senderIdNum, receiverId: receiverIdNum },
                    { senderId: receiverIdNum, receiverId: senderIdNum },
                ],
            },
            orderBy: {
                timestamp: 'asc',
            },
        });
        return reply.send(messages);
    }
    catch (err) {
        console.error(err);
        return reply.status(500).send({ error: 'Falha ao buscar as mensagens' });
    }
}));
// Rota para buscar mensagens de um usuário específico
server.get('/messages/:userId', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = parseInt(request.params.userId, 10);
    if (isNaN(userId)) {
        return reply.status(400).send({ error: 'ID inválido' });
    }
    try {
        const messages = yield prisma.message.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
            },
            orderBy: { timestamp: 'asc' },
        });
        return reply.send(messages);
    }
    catch (err) {
        console.error(err);
        return reply.status(500).send({ error: 'Falha ao buscar mensagens' });
    }
}));
// Rota para buscar a lista de conversas únicas do usuário
server.get('/messages/conversations/:userId', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = parseInt(request.params.userId, 10);
    if (isNaN(userId)) {
        return reply.status(400).send({ error: 'ID inválido' });
    }
    try {
        const conversations = yield prisma.message.groupBy({
            by: ['senderId', 'receiverId'],
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
            },
            _max: { timestamp: true },
        });
        // Formatar o retorno para exibir os usuários únicos e a última mensagem
        const formattedConversations = yield Promise.all(conversations.map((conv) => __awaiter(void 0, void 0, void 0, function* () {
            const otherUserId = conv.senderId === userId ? conv.receiverId : conv.senderId;
            // Buscar a última mensagem trocada
            const lastMessage = yield prisma.message.findFirst({
                where: {
                    OR: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId },
                    ],
                },
                orderBy: { timestamp: 'desc' },
            });
            return {
                userId: otherUserId,
                lastMessage: (lastMessage === null || lastMessage === void 0 ? void 0 : lastMessage.content) || '',
                timestamp: lastMessage === null || lastMessage === void 0 ? void 0 : lastMessage.timestamp,
            };
        })));
        return reply.send(formattedConversations);
    }
    catch (err) {
        console.error(err);
        return reply.status(500).send({ error: 'Falha ao buscar conversas' });
    }
}));
// Rota para adicionar imóveis
server.post("/property", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_4, _b, _c;
    try {
        const parts = request.parts(); // Processa arquivos e campos multipart
        const imagensUrls = [];
        const formData = {};
        try {
            // Processar as partes da requisição
            for (var _d = true, parts_4 = __asyncValues(parts), parts_4_1; parts_4_1 = yield parts_4.next(), _a = parts_4_1.done, !_a; _d = true) {
                _c = parts_4_1.value;
                _d = false;
                const part = _c;
                if (part.type === "file") {
                    // Garante que o nome do arquivo seja único usando timestamp
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join("uploads", fileName); // Diretório 'uploads/'
                    // Gera a URL pública que pode ser acessada
                    const imageUrl = `/uploads/${fileName}`.replace(/\/+/g, "/"); // Elimina múltiplos "/"
                    console.log("URL gerada:", imageUrl);
                    // Faz o upload do arquivo para o diretório "uploads/"
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                    // Adiciona a URL da imagem ao array de URLs
                    imagensUrls.push(imageUrl);
                }
                else if (typeof part.value === "string") {
                    // Adiciona os campos de texto ao formData
                    formData[part.fieldname] = part.value;
                }
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parts_4.return)) yield _b.call(parts_4);
            }
            finally { if (e_4) throw e_4.error; }
        }
        const { title, price, description, description1, userId, latitude, longitude, category } = formData;
        // Verifica se todos os campos obrigatórios estão presentes
        if (!title || !price || !description || !description1 || !userId || !latitude || !longitude || !category) {
            return reply.status(400).send({ error: "Todos os campos são obrigatórios." });
        }
        // Validação do esquema Joi
        const { error } = propertySchema.validate({
            title,
            price: Number(price),
            description,
            description1,
            userId: Number(userId),
            latitude: Number(latitude),
            longitude: Number(longitude),
            category: category[0].toUpperCase() + category.slice(1).toLowerCase(), // Formatação da categoria
            images: imagensUrls,
        });
        if (error) {
            console.error("Erro de validação:", error.details);
            return reply.status(400).send({ error: error.details[0].message });
        }
        // Criar o imóvel no banco de dados com as URLs das imagens
        const property = yield prisma.property.create({
            data: {
                title,
                price: Number(price),
                description,
                description1,
                userId: Number(userId),
                latitude: Number(latitude),
                longitude: Number(longitude),
                category: category[0].toUpperCase() + category.slice(1).toLowerCase(),
                images: { create: imagensUrls.map((url) => ({ url })) }, // Adiciona as URLs no banco
            },
            include: { images: true },
        });
        console.log("Imagens no banco:", property.images);
        return reply.status(201).send({ message: "Imóvel criado com sucesso", property });
    }
    catch (err) {
        console.error("Erro ao criar imóvel:", err);
        return reply.status(500).send({ error: "Falha ao criar imóvel. Tente novamente." });
    }
}));
// Rota para listar imóveis
server.get("/property", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const properties = yield prisma.property.findMany({
            include: {
                images: {
                    select: {
                        url: true, // Supondo que você tenha um campo `url` na tabela de imagens
                    },
                },
                user: {
                    select: {
                        username: true, // Incluindo o nome do usuário
                    },
                },
            },
        });
        // Aqui, se necessário, você pode mapear as imagens para garantir que cada imóvel tenha apenas as URLs das imagens
        const propertiesWithImages = properties.map((property) => (Object.assign(Object.assign({}, property), { images: property.images.map((image) => image.url) })));
        return reply.send(propertiesWithImages);
    }
    catch (error) {
        console.error("Erro ao buscar imóveis:", error);
        return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
}));
// Rota para listar imóveis do usuário
server.get('/property/user', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = request.query;
    const numericUserId = Number(userId); // Converte userId para número
    if (isNaN(numericUserId)) {
        return reply.status(400).send({ error: 'UserId é obrigatório e deve ser um número' });
    }
    try {
        const properties = yield prisma.property.findMany({
            where: { userId: numericUserId },
            include: {
                images: true, // Inclui as imagens associadas ao imóvel
                user: {
                    select: {
                        username: true, // Incluindo o nome do usuário
                    },
                },
            },
        });
        // Verificando se as propriedades foram encontradas
        if (properties.length === 0) {
            return reply.status(200).send([]); // Retorna uma lista vazia caso não haja imóveis
        }
        // Mapeando os imóveis para incluir as URLs completas das imagens
        const propertiesUrl = properties.map((property) => {
            const updatedImages = property.images.map((image) => {
                const imageUrl = `https://server-2-production.up.railway.app${image.url}`;
                return imageUrl; // Retorna a URL completa da imagem
            });
            return Object.assign(Object.assign({}, property), { images: updatedImages, username: property.user.username });
        });
        return reply.send(propertiesUrl); // Retorna a lista de imóveis com URLs das imagens e o nome do usuário
    }
    catch (error) {
        console.error('Erro ao buscar imóveis do usuário:', error);
        return reply.status(500).send({ error: 'Falha ao buscar imóveis' });
    }
}));
// Rota para obter detalhes de um imóvel específico
server.get("/property/:id", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = request.params;
        if (isNaN(Number(id))) {
            return reply.status(400).send({ error: "ID inválido." });
        }
        const property = yield prisma.property.findUnique({
            where: { id: Number(id) },
            include: {
                images: true,
                user: { select: { id: true, name: true, email: true, username: true } } // Inclui apenas os dados necessários do usuário
            }
        });
        if (!property) {
            return reply.status(404).send({ error: "Imóvel não encontrado." });
        }
        return reply.send(property);
    }
    catch (err) {
        console.error("Erro ao buscar imóvel:", err);
        return reply.status(500).send({ error: "Falha ao buscar imóvel. Tente novamente." });
    }
}));
// Rota para editar imóveis
server.put("/property/:id", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_5, _b, _c;
    try {
        const { id } = request.params; // Captura o ID do imóvel
        const parts = request.parts(); // Processa arquivos e campos multipart
        const imagensUrls = [];
        const formData = {};
        try {
            for (var _d = true, parts_5 = __asyncValues(parts), parts_5_1; parts_5_1 = yield parts_5.next(), _a = parts_5_1.done, !_a; _d = true) {
                _c = parts_5_1.value;
                _d = false;
                const part = _c;
                if (part.type === "file") {
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join("uploads", fileName);
                    const imageUrl = `/uploads/${fileName}`.replace(/\/+/g, "/");
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                    imagensUrls.push(imageUrl);
                }
                else if (typeof part.value === "string") {
                    formData[part.fieldname] = part.value;
                }
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = parts_5.return)) yield _b.call(parts_5);
            }
            finally { if (e_5) throw e_5.error; }
        }
        const { title, price, description, description1, userId, latitude, longitude, category, existingImages, // Nova chave para imagens existentes
         } = formData;
        if (!title && !price && !description && !description1 && !latitude && !longitude && !category && imagensUrls.length === 0) {
            return reply.status(400).send({ error: "Nenhum dado enviado para atualizar o imóvel." });
        }
        const existingProperty = yield prisma.property.findUnique({
            where: { id: Number(id) },
            include: { images: true }, // Inclui as imagens associadas
        });
        if (!existingProperty) {
            return reply.status(404).send({ error: "Imóvel não encontrado." });
        }
        // Parse das imagens existentes enviadas no corpo
        const existingImagesArray = existingImages ? JSON.parse(existingImages) : [];
        // Remove imagens que não estão na lista de imagens existentes
        const imagesToRemove = existingProperty.images.filter((image) => !existingImagesArray.includes(image.url));
        yield prisma.image.deleteMany({
            where: { id: { in: imagesToRemove.map((image) => image.id) } },
        });
        // Atualiza o imóvel no banco de dados
        const updatedProperty = yield prisma.property.update({
            where: { id: Number(id) },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (title && { title })), (price && { price: Number(price) })), (description && { description })), (description1 && { description1 })), (latitude && { latitude: Number(latitude) })), (longitude && { longitude: Number(longitude) })), (category && { category: category[0].toUpperCase() + category.slice(1).toLowerCase() })), { images: {
                    create: imagensUrls.map((url) => ({ url })), // Adiciona novas imagens
                } }),
            include: { images: true }, // Retorna as imagens atualizadas
        });
        return reply.status(200).send({
            message: "Imóvel atualizado com sucesso",
            property: updatedProperty,
        });
    }
    catch (err) {
        console.error("Erro ao atualizar imóvel:", err);
        return reply.status(500).send({ error: "Falha ao atualizar imóvel. Tente novamente." });
    }
}));
// Rota para deletar um imóvel
server.delete("/property/:id", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = request.params;
    const propertyId = Number(id);
    if (isNaN(propertyId)) {
        return reply
            .status(400)
            .send({ error: "ID do imóvel deve ser um número válido" });
    }
    try {
        const existingProperty = yield prisma.property.findUnique({
            where: { id: propertyId },
            include: { images: true },
        });
        if (!existingProperty) {
            return reply.status(404).send({ error: "Imóvel não encontrado" });
        }
        // Caminho para a pasta de uploads
        const uploadsDir = path_1.default.resolve(__dirname, "..", "uploads");
        // Remova os arquivos físicos das imagens associadas
        for (const image of existingProperty.images) {
            const imagePath = path_1.default.join(uploadsDir, image.url); // Certifique-se de que `filePath` é o campo correto no banco
            if (fs_1.default.existsSync(imagePath)) {
                fs_1.default.unlinkSync(imagePath);
            }
        }
        yield prisma.image.deleteMany({ where: { propertyId } });
        yield prisma.property.delete({ where: { id: propertyId } });
        return reply.status(200).send({ message: "Imóvel deletado com sucesso" });
    }
    catch (error) {
        console.error("Erro ao deletar imóvel:", error);
        return reply.status(500).send({ error: "Falha ao deletar imóvel" });
    }
}));
// Iniciar o servidor
server.listen({ port: 3333, host: "0.0.0.0" }, (err) => {
    if (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
    console.log("Server listening at http://0.0.0.0:3333");
});
