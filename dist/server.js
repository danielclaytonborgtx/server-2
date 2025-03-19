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
// Rota de registro de usuários-ok
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
// Rota de login via usuário e senha-ok
server.post("/session", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { error } = loginSchema.validate(request.body);
    if (error) {
        return reply.status(400).send({ error: error.details[0].message });
    }
    const { username, password } = request.body;
    try {
        const user = yield prisma.user.findUnique({
            where: { username },
            include: {
                teamMembers: {
                    include: {
                        team: true,
                    }
                }
            }
        });
        console.log("Usuário encontrado:", user);
        if (!user || !(yield bcrypt_1.default.compare(password, user.password))) {
            console.error("Erro: Usuário ou senha inválidos");
            return reply.status(401).send({ error: "Invalid username or password" });
        }
        // Garantir que o campo picture seja tratado como opcional
        const userTeam = user.teamMembers.length > 0 ? user.teamMembers[0].team : null;
        return reply.send({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                picture: user.picture || null,
                team: userTeam, // Incluindo a equipe do usuário
            },
        });
    }
    catch (error) {
        console.error("Erro ao fazer login:", error);
        return reply.status(500).send({ error: "Falha ao fazer login" });
    }
}));
// Rota para atualizar a imagem de perfil do usuário-ok
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
// Rota para obter a imagem de perfil do usuário-ok
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
// Rota de login com Google (ID Token)-ok
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
// Rota de buscar todos usuários-ok
server.get('/users', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield prisma.user.findMany({
            include: {
                teamMembers: {
                    include: {
                        team: true, // Inclui os dados das equipes
                    },
                },
            },
        });
        return reply.send(users);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Failed to fetch users' });
    }
}));
// Rota para filtrar usuario sem time-testar
server.get('/users/no-team', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Rota /users/no-team acessada'); // Log de acesso à rota
    try {
        const users = yield prisma.user.findMany({
            where: {
                teamMembers: {
                    none: {}
                },
            },
        });
        console.log('Usuários sem equipe encontrados:', users); // Log dos usuários encontrados
        return reply.send(users);
    }
    catch (error) {
        console.error('Erro na rota /users/no-team:', error); // Log de erro
        return reply.status(500).send({ error: 'Falha ao buscar usuários sem equipe' });
    }
}));
// Rota de buscar usuário por ID e username-ok
server.get('/users/:identifier', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const { identifier } = request.params;
    try {
        let user;
        if (!isNaN(Number(identifier))) {
            user = yield prisma.user.findUnique({
                where: { id: Number(identifier) },
                select: { id: true, name: true, email: true, teamMembers: true }, // Adicione 
            });
        }
        else {
            user = yield prisma.user.findUnique({
                where: { username: identifier },
                select: { id: true, name: true, email: true, teamMembers: true }, // Adicione teamId
            });
        }
        if (!user) {
            return reply.status(404).send({ error: 'Usuário não encontrado' });
        }
        return reply.send(user);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Erro ao buscar usuário' });
    }
}));
// Rota para criar equipes-ok
server.post("/team", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_2, _b, _c;
    try {
        const parts = request.parts();
        let teamImageUrl = "";
        let teamName = "";
        let members = [];
        try {
            for (var _d = true, parts_2 = __asyncValues(parts), parts_2_1; parts_2_1 = yield parts_2.next(), _a = parts_2_1.done, !_a; _d = true) {
                _c = parts_2_1.value;
                _d = false;
                const part = _c;
                if (part.type === "file") {
                    const uploadDir = path_1.default.join(__dirname, '../uploads');
                    if (!fs_1.default.existsSync(uploadDir)) {
                        fs_1.default.mkdirSync(uploadDir, { recursive: true });
                    }
                    const fileName = `${Date.now()}_${part.filename}`;
                    const filePath = path_1.default.join(uploadDir, fileName);
                    teamImageUrl = `/uploads/${fileName}`.replace(/\/+/g, "/");
                    yield (0, pump_1.default)(part.file, fs_1.default.createWriteStream(filePath));
                }
                else if (part.fieldname === "name") {
                    teamName = typeof part.value === "string" ? part.value : String(part.value);
                }
                else if (part.fieldname === "members") {
                    try {
                        const parsedMembers = JSON.parse(String(part.value));
                        if (Array.isArray(parsedMembers)) {
                            members = parsedMembers.map((id) => Number(id));
                        }
                    }
                    catch (err) {
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
        if (!teamName || members.length === 0) {
            return reply.status(400).send({ error: "Nome da equipe e membros são obrigatórios." });
        }
        // Criando a equipe no banco de dados
        const newTeam = yield prisma.team.create({
            data: { name: teamName, imageUrl: teamImageUrl },
        });
        // Criando convites para os membros (exceto para o criador da equipe)
        const creatorId = members[0]; // Assumindo que o primeiro membro é o criador
        const membersToInvite = members.filter(id => id !== creatorId);
        // Criando convites para os membros
        const invitations = yield prisma.teamInvitation.createMany({
            data: membersToInvite.map((userId) => ({
                teamId: newTeam.id,
                userId,
                status: 'PENDING', // Convite pendente
            })),
        });
        // Adiciona o criador como membro efetivo
        yield prisma.teamMember.create({
            data: {
                teamId: newTeam.id,
                userId: creatorId,
            },
        });
        // Buscando dados dos membros atualizados (inclusive o criador)
        const updatedMembers = yield prisma.user.findMany({
            where: { id: { in: members } },
            select: { id: true, name: true },
        });
        return reply.status(201).send({
            message: "Equipe criada com sucesso!",
            team: newTeam,
            members: updatedMembers,
            invitations, // Envia os convites criados como resposta
        });
    }
    catch (err) {
        console.error(err);
        return reply.status(500).send({ error: "Falha ao criar equipe. Tente novamente." });
    }
}));
server.get("/team-invitations/:userId", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = request.params;
        // Busca todos os convites pendentes para o usuário
        const invitations = yield prisma.teamInvitation.findMany({
            where: {
                userId: Number(userId),
                status: 'PENDING'
            },
            include: {
                team: {
                    select: {
                        name: true,
                        imageUrl: true
                    }
                }
            }
        });
        if (!invitations) {
            return reply.status(404).send({ error: "Nenhum convite encontrado." });
        }
        return reply.send(invitations);
    }
    catch (error) {
        console.error("Erro ao buscar convites:", error);
        return reply.status(500).send({ error: "Erro ao buscar convites. Tente novamente." });
    }
}));
// Rota para ceitar convite de equipe
server.post("/team/invite/:invitationId/:action", (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { invitationId, action } = request.params;
        const { userId } = request.body; // Pegando userId do corpo da requisição
        console.log('Dados recebidos:', { invitationId, action, userId });
        // Verificar se o convite existe e pertence ao usuário
        const invitation = yield prisma.teamInvitation.findUnique({
            where: { id: Number(invitationId) },
        });
        if (!invitation) {
            return reply.status(404).send({ error: "Convite não encontrado." });
        }
        if (invitation.userId !== userId) {
            return reply.status(403).send({ error: "Você não tem permissão para responder a este convite." });
        }
        // Verificar se o usuário já está em uma equipe
        const userTeam = yield prisma.teamMember.findFirst({
            where: { userId: invitation.userId },
        });
        if (userTeam && action === 'accept') {
            return reply.status(400).send({ error: "Você já faz parte de uma equipe e não pode aceitar novos convites." });
        }
        // Se o convite for aceito, adicionar o usuário à equipe
        if (action === 'accept') {
            yield prisma.teamMember.create({
                data: {
                    teamId: invitation.teamId,
                    userId: invitation.userId,
                },
            });
            // Atualizar status do convite para 'ACEITO'
            yield prisma.teamInvitation.update({
                where: { id: Number(invitationId) },
                data: { status: 'ACCEPTED' },
            });
            return reply.status(200).send({ message: "Convite aceito, você foi adicionado à equipe." });
        }
        // Se o convite for rejeitado, deletar o convite
        if (action === 'reject') {
            yield prisma.teamInvitation.delete({
                where: { id: Number(invitationId) },
            });
            return reply.status(200).send({ message: "Convite rejeitado." });
        }
        return reply.status(400).send({ error: "Ação inválida. Use 'accept' ou 'reject'." });
    }
    catch (err) {
        console.error("Erro ao processar convite:", err);
        return reply.status(500).send({
            error: "Falha ao processar convite. Tente novamente.",
            details: err instanceof Error ? err.message : 'Erro desconhecido'
        });
    }
}));
// Rota para adicionar corretor a equipe
server.post('/teams/:teamId/member', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teamId } = request.params;
        const { userId } = request.body;
        console.log(`Solicitação para convidar usuário ${userId} para a equipe ${teamId}`);
        // Verifica se a equipe existe
        const team = yield prisma.team.findUnique({
            where: { id: parseInt(teamId) },
            include: { teamMembers: true },
        });
        if (!team) {
            console.log('Equipe não encontrada.');
            return reply.status(404).send({ error: 'Equipe não encontrada.' });
        }
        // Verifica se o usuário já é membro da equipe
        const isAlreadyMember = team.teamMembers.some(member => member.userId === userId);
        if (isAlreadyMember) {
            console.log('Usuário já é membro da equipe.');
            return reply.status(400).send({ error: 'Usuário já é membro da equipe.' });
        }
        // Verifica se o usuário já foi convidado
        const existingInvitation = yield prisma.teamInvitation.findFirst({
            where: { teamId: parseInt(teamId), userId, status: 'PENDING' },
        });
        if (existingInvitation) {
            console.log('Usuário já foi convidado.');
            return reply.status(400).send({ error: 'Usuário já possui um convite pendente.' });
        }
        // Cria um convite para o usuário
        const invitation = yield prisma.teamInvitation.create({
            data: {
                teamId: parseInt(teamId),
                userId,
                status: 'PENDING', // Convite pendente
            },
        });
        console.log(`Convite enviado para o usuário ${userId}`);
        return reply.status(200).send({ message: 'Convite enviado com sucesso.', invitation });
    }
    catch (error) {
        console.error('Erro ao enviar convite:', error);
        return reply.status(500).send({ error: 'Erro ao enviar convite.' });
    }
}));
// Rota para sair da equipe-ok
server.post('/teams/:teamId/leave', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teamId } = request.params;
        const { userId } = request.body;
        console.log(`Usuário ${userId} solicitou sair da equipe ${teamId}`);
        // Verifica se a equipe existe
        const team = yield prisma.team.findUnique({
            where: { id: parseInt(teamId) },
            include: { teamMembers: true },
        });
        if (!team) {
            console.log('Equipe não encontrada.');
            return reply.status(404).send({ error: 'Equipe não encontrada.' });
        }
        // Verifica se o usuário é membro da equipe
        const isMember = team.teamMembers.some((member) => member.userId === userId);
        if (!isMember) {
            console.log('Usuário não é membro da equipe.');
            return reply.status(400).send({ error: 'Usuário não é membro da equipe.' });
        }
        // Usa uma transação para garantir que todas as operações sejam executadas
        yield prisma.$transaction([
            // Remove o usuário da equipe
            prisma.teamMember.deleteMany({
                where: {
                    teamId: parseInt(teamId),
                    userId: userId,
                },
            }),
            // Remove quaisquer convites pendentes
            prisma.teamInvitation.deleteMany({
                where: {
                    teamId: parseInt(teamId),
                    userId: userId,
                },
            })
        ]);
        // Retorna uma resposta de sucesso
        return reply.status(200).send({ message: 'Usuário saiu da equipe com sucesso.' });
    }
    catch (error) {
        console.error('Erro ao deixar a equipe:', error);
        return reply.status(500).send({ error: 'Erro ao deixar a equipe.' });
    }
}));
// Rota para editar equipe
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
            // Remove os membros que não estão mais na equipe
            const currentMembers = yield prisma.teamMember.findMany({
                where: { teamId },
            });
            const currentMemberIds = currentMembers.map((member) => member.userId);
            const removedMembers = currentMemberIds.filter((id) => !members.includes(id));
            if (removedMembers.length > 0) {
                console.log('🚫 Removendo membros da equipe:', removedMembers);
                yield prisma.teamMember.deleteMany({
                    where: {
                        teamId,
                        userId: { in: removedMembers },
                    },
                });
            }
            // Adiciona os novos membros à equipe
            const newMembers = members.filter((id) => !currentMemberIds.includes(id));
            if (newMembers.length > 0) {
                console.log('➕ Adicionando novos membros à equipe:', newMembers);
                yield prisma.teamMember.createMany({
                    data: newMembers.map((userId) => ({
                        teamId,
                        userId,
                    })),
                });
                // Envia convites para os novos membros
                for (const userId of newMembers) {
                    console.log(`Enviando convite para o usuário ${userId}`);
                    // Verifica se o convite já existe
                    const existingInvitation = yield prisma.teamInvitation.findFirst({
                        where: { teamId, userId, status: 'PENDING' },
                    });
                    if (existingInvitation) {
                        console.log(`Usuário ${userId} já possui um convite pendente.`);
                    }
                    else {
                        // Cria um novo convite
                        yield prisma.teamInvitation.create({
                            data: {
                                teamId,
                                userId,
                                status: 'PENDING', // Convite pendente
                            },
                        });
                        console.log(`Convite enviado para o usuário ${userId}`);
                    }
                }
            }
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
// Rota para remover membro da equipe
server.delete('/team/member/:teamId/:id', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    // Garantindo que os parâmetros são passados corretamente
    const { teamId, id } = request.params;
    try {
        // Convertendo os parâmetros para número
        const teamIdNumber = parseInt(teamId);
        const userIdNumber = parseInt(id);
        // Verificando se a conversão foi bem-sucedida
        if (isNaN(teamIdNumber) || isNaN(userIdNumber)) {
            return reply.status(400).send({ error: 'ID ou teamId inválido.' });
        }
        // Verifica se o membro existe na equipe
        const teamMember = yield prisma.teamMember.findUnique({
            where: {
                teamId_userId: {
                    teamId: teamIdNumber,
                    userId: userIdNumber,
                },
            },
        });
        if (!teamMember) {
            return reply.status(404).send({ error: 'Membro não encontrado na equipe.' });
        }
        // Exclui o membro da equipe
        yield prisma.teamMember.delete({
            where: {
                teamId_userId: {
                    teamId: teamIdNumber,
                    userId: userIdNumber,
                },
            },
        });
        return reply.status(200).send({ message: 'Corretor removido da equipe com sucesso.' });
    }
    catch (error) {
        console.error('Erro ao remover membro da equipe:', error);
        return reply.status(500).send({ error: 'Erro ao remover corretor da equipe.' });
    }
}));
// Rota para ver uma equipe
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
                teamMembers: {
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
            members: team.teamMembers.map(member => ({
                userId: member.user.id, // Adicionar o userId
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
                teamMembers: {
                    include: {
                        user: true, // Inclui o usuário do membro
                    },
                },
            },
        });
        // Mapeia as equipes para incluir o creatorId e os membros com userId
        const teamsWithCreatorAndMembers = teams.map((team) => {
            var _a;
            const creatorId = (_a = team.teamMembers[0]) === null || _a === void 0 ? void 0 : _a.userId; // Considera o primeiro membro como criador
            const members = team.teamMembers.map((member) => ({
                userId: member.user.id, // Inclui o userId de cada membro
                name: member.user.name,
                email: member.user.email,
                // Adicione outros campos do usuário, se necessário
            }));
            return {
                id: team.id,
                name: team.name,
                imageUrl: team.imageUrl, // URL da imagem da equipe
                creatorId, // ID do criador da equipe
                members, // Lista de membros da equipe
            };
        });
        return reply.send(teamsWithCreatorAndMembers);
    }
    catch (error) {
        console.error(error);
        return reply.status(500).send({ error: 'Erro ao buscar todas as equipes' });
    }
}));
// Rota para deletar equipe
server.delete('/team/:id', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = Number(request.params.id);
        if (isNaN(teamId)) {
            return reply.status(400).send({ error: 'ID inválido.' });
        }
        console.log(`Tentando excluir a equipe com ID: ${teamId}`);
        // Verifica se o time existe antes de deletar
        const existingTeam = yield prisma.team.findUnique({
            where: { id: teamId },
        });
        if (!existingTeam) {
            console.error(`Equipe com ID ${teamId} não encontrada.`);
            return reply.status(404).send({ error: 'Equipe não encontrada.' });
        }
        // Usando uma transação para garantir que todas as operações sejam executadas ou nenhuma
        yield prisma.$transaction((prisma) => __awaiter(void 0, void 0, void 0, function* () {
            // Primeiro, deletamos os convites pendentes
            yield prisma.teamInvitation.deleteMany({
                where: { teamId: teamId },
            });
            console.log(`Convites da equipe ${teamId} excluídos.`);
            // Depois, deletamos os membros da equipe
            yield prisma.teamMember.deleteMany({
                where: { teamId: teamId },
            });
            console.log(`Membros da equipe ${teamId} excluídos.`);
            // Por fim, deletamos a equipe
            yield prisma.team.delete({
                where: { id: teamId },
            });
        }));
        console.log(`Equipe com ID ${teamId} excluída com sucesso.`);
        reply.status(200).send({ message: 'Equipe deletada com sucesso.' });
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('Erro ao deletar a equipe:', error.message);
            reply.status(500).send({ error: 'Erro ao deletar a equipe', details: error.message });
        }
        else {
            console.error('Erro desconhecido:', error);
            reply.status(500).send({ error: 'Erro ao deletar a equipe' });
        }
    }
}));
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
        // Buscar todas as conversas do usuário
        const conversations = yield prisma.message.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
            },
            orderBy: { timestamp: 'desc' }, // Ordenar por timestamp para pegar a última mensagem primeiro
        });
        // Usar um objeto para evitar duplicação de userId
        const uniqueConversations = {};
        for (const message of conversations) {
            const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
            // Se a conversa já foi processada, pule
            if (uniqueConversations[otherUserId])
                continue;
            // Adicionar a conversa ao objeto
            uniqueConversations[otherUserId] = {
                userId: otherUserId,
                lastMessage: message.content || '',
                timestamp: message.timestamp || new Date(),
            };
        }
        // Converter o objeto de volta para um array
        const formattedConversations = Object.values(uniqueConversations);
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
// Rota para filtrar imoveis por id e teamId
server.get('/properties/filter', (request, reply) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🚀 Rota '/properties/filter' foi chamada!");
    try {
        const { userId, teamId } = request.query;
        console.log("🔍 Query recebida:", request.query);
        // Verifica se o userId foi passado
        if (!userId) {
            console.error("❌ userId ausente!");
            return reply.status(400).send({ error: "userId é obrigatório" });
        }
        // Converte para número
        const userIdNumber = Number(userId);
        const teamIdNumber = teamId ? Number(teamId) : null; // teamId é opcional
        console.log("✅ Valores convertidos:", { userIdNumber, teamIdNumber });
        if (isNaN(userIdNumber) || (teamId && isNaN(teamIdNumber))) {
            console.error("❌ userId ou teamId não são números válidos!");
            return reply.status(400).send({ error: "userId e teamId (se fornecido) devem ser números válidos" });
        }
        // Consulta ao banco de dados
        const properties = yield prisma.property.findMany({
            where: {
                OR: [
                    { userId: userIdNumber }, // Propriedades do usuário
                    ...(teamIdNumber !== null ? [{ user: { teamMembers: { some: { teamId: teamIdNumber } } } }] : []), // Propriedades da equipe (se teamId for fornecido)
                ],
            },
            include: {
                user: {
                    include: {
                        teamMembers: {
                            include: { team: true },
                        },
                    },
                },
                images: true,
            },
        });
        console.log("📌 Propriedades encontradas:", JSON.stringify(properties, null, 2));
        return reply.send(properties);
    }
    catch (error) {
        console.error("🔥 Erro ao buscar propriedades:", error);
        return reply.status(500).send({ error: "Erro ao buscar as propriedades" });
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
                const imageUrl = `https://servercasaperto.onrender.com${image.url}`;
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
const port = Number(process.env.PORT) || 3333; // Converte a porta para número
server.listen({ port, host: "0.0.0.0" }, (err) => {
    if (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
    console.log(`Server listening at http://0.0.0.0:${port}`);
});
//# sourceMappingURL=server.js.map