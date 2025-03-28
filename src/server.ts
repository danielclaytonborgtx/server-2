import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import Joi from "joi";
import { OAuth2Client } from 'google-auth-library';
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import pump from 'pump';
import cloudinary from './cloudinary';

const server = Fastify();
const prisma = new PrismaClient();
const client = new OAuth2Client('468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com');

server.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, 
    files: 10,
  },
});

// const uploadsPath = path.join(__dirname, '../uploads');

// // Registra o plugin para servir arquivos estáticos
// server.register(fastifyStatic, {
//   root: uploadsPath,
//   prefix: '/uploads/', // URL base para acessar os arquivos
// });

// Habilitar CORS
server.register(cors, {
  origin: "*", // Ajuste conforme necessário
});

interface Params {
  id: string; // Ou 'id: number' se for um número
}

interface FilterQuery {
  userId: string;
  teamId: string;
}

// Interfaces para o corpo das requisições
interface RegisterRequest {
  name: string;
  email: string;
  username: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface PropertyRequest {
  title: string;
  description: string;
  description1: string;
  price: number;
  latitude: number;
  longitude: number;
  category: string;
  userId: number;
  images: string[];
}

interface MessageRequest {
  senderId: number;
  receiverId: number;
  content: string;
}

interface TeamRequest {
  name: string;
  members: number[]; // IDs dos membros
  imageUrl: string; // Caminho da imagem da equipe
}

// Esquemas de validação
const registerSchema = Joi.object<RegisterRequest>({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object<LoginRequest>({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const propertySchema = Joi.object<PropertyRequest>({
  title: Joi.string().required(),
  description: Joi.string().required(),
  description1: Joi.string().required(),
  price: Joi.number().required(),
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  category: Joi.string().valid('Venda', 'Aluguel').required(),
  userId: Joi.number().required(),
  images: Joi.array().min(1).required(),
});

const messageSchema = Joi.object({
  senderId: Joi.number().required(), // Id do remetente
  receiverId: Joi.number().required(), // Id do destinatário
  content: Joi.string().min(1).required(), // Conteúdo da mensagem
});

const teamSchema = Joi.object<TeamRequest>({
  name: Joi.string().required(),
  members: Joi.array().items(Joi.number().integer().required()).min(1).required(),
  imageUrl: Joi.string().uri().optional(), // Validação para a URL da imagem, caso fornecida
});

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: number; // Id do usuário
      email: string; // Email do usuário (ou outros campos que você desejar)
      username: string; // Nome de usuário
    };
  }
}

// Rota de registro de usuários-ok
server.post("/users",
  async (
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply
  ) => {
    console.log("Requisição recebida:", request.body); // Log da entrada

    const { error } = registerSchema.validate(request.body);
    if (error) {
      console.error("Erro de validação:", error.details[0].message);
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { name, email, username, password } = request.body;

    try {
      console.log("Verificando usuário existente...");
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        console.error("Username já utilizado:", username);
        return reply.status(409).send({ error: "Username já utilizado" });
      }

      console.log("Hashing da senha...");
      const hashedPassword = await bcrypt.hash(password, 10);

      console.log("Criando usuário...");
      const user = await prisma.user.create({
        data: {
          name,
          email,
          username,
          password: hashedPassword,
        },
      });

      console.log("Usuário criado com sucesso:", user);
      return reply.status(201).send({ user });
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      return reply.status(500).send({ error: "Falha ao criar usuário" });
    }
  }
);

// Rota de login via usuário e senha-ok
server.post("/session", 
  async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    const { error } = loginSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { username, password } = request.body;

    try {
      const user = await prisma.user.findUnique({
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

      if (!user || !(await bcrypt.compare(password, user.password))) {
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
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return reply.status(500).send({ error: "Falha ao fazer login" });
    }
  }
);

// Rota para atualizar a imagem de perfil do usuário-ok
server.post("/users/:id/profile-picture", 
  async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const parts = request.parts(); // Processa arquivos e campos multipart
      let profilePictureUrl: string = ""; // Variável para armazenar a URL da imagem de perfil

      // Processar as partes da requisição
      for await (const part of parts) {
        if (part.type === "file") {
          // Converte o arquivo em buffer
          const buffer = await part.toBuffer();

          // Faz o upload para o Cloudinary
          const result = await new Promise<any>((resolve, reject) => {  // Use "any" aqui
            cloudinary.uploader.upload_stream(
              {
                folder: "profile_pictures", // Pasta onde as imagens serão armazenadas no Cloudinary
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(buffer); // Envia o arquivo como stream
          });

          // A URL segura gerada pelo Cloudinary
          profilePictureUrl = result.secure_url; // A URL segura é o que você vai armazenar
          console.log("URL gerada:", profilePictureUrl);
        }
      }

      // Verifica se a URL da imagem foi gerada
      if (!profilePictureUrl) {
        return reply.status(400).send({ error: "Imagem de perfil não fornecida." });
      }

      // Atualiza a imagem de perfil do usuário no banco de dados
      const updatedUser = await prisma.user.update({
        where: { id: Number(request.params.id) },
        data: {
          picture: profilePictureUrl, // Atualiza o campo "picture" com a URL da imagem
        },
      });

      return reply.status(200).send({ message: "Imagem de perfil atualizada com sucesso", user: updatedUser });
    } catch (err) {
      console.error("Erro ao atualizar imagem de perfil:", err);
      return reply.status(500).send({ error: "Falha ao atualizar a imagem de perfil. Tente novamente." });
    }
  }
);

// Rota para obter a imagem de perfil do usuário-ok
server.get("/users/:id/profile-picture", 
  async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  try {
    // Busca o usuário no banco de dados
    const user = await prisma.user.findUnique({
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
  } catch (err) {
    return reply.status(500).send({ error: "Falha ao carregar imagem de perfil." });
  }
});

// Rota de login com Google (ID Token)-ok
server.post("/google-login",
  async (request: FastifyRequest<{ Body: { id_token: string } }>, reply: FastifyReply) => {
    const { id_token } = request.body;

    try {
      // Verificar o ID token do Google usando o client OAuth2Client
      const ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: '468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com', // ID do cliente Google
      });

      const payload = ticket.getPayload();

      if (payload && payload.email && payload.name) {
        // Gerar uma senha temporária ou aleatória
        const tempPassword = Math.random().toString(36).slice(-8);

        // Verifique ou crie um usuário baseado no payload do Google
        const user = await prisma.user.upsert({
          where: { email: payload.email },
          update: {},
          create: {
            email: payload.email,
            username: payload.email,
            name: payload.name,
            picture: payload.picture || '', // Defina uma string vazia se a imagem estiver indefinida
            password: await bcrypt.hash(tempPassword, 10),
          },
        });

        return reply.send({ message: "Login successful", user });
      }

      return reply.status(400).send({ error: 'Google login failed: informações incompletas' });
    } catch (error) {
      console.error('Erro ao autenticar com o Google:', error);
      return reply.status(500).send({ error: 'Erro no login com o Google' });
    }
  }
);

// Rota de buscar todos usuários-ok
server.get('/users', 
  async (request, reply) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        teamMembers: { // Inclui as equipes associadas ao usuário
          include: {
            team: true, // Inclui os dados das equipes
          },
        },
      },
    });
    return reply.send(users);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Failed to fetch users' });
  }
});

// Rota para filtrar usuario sem time-testar
server.get('/users/no-team', 
  async (request, reply) => {
  console.log('Rota /users/no-team acessada'); // Log de acesso à rota
  try {
    const users = await prisma.user.findMany({
      where: {
        teamMembers: {
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

// Rota de buscar usuário por ID e username-ok
server.get('/users/:identifier', 
  async (request: FastifyRequest<{ Params: { identifier: string } }>, reply: FastifyReply) => {
  const { identifier } = request.params;
  
  try {
    let user;

    if (!isNaN(Number(identifier))) {
      user = await prisma.user.findUnique({ 
        where: { id: Number(identifier) },
        select: { id: true, name: true, username: true, email: true, teamMembers: true }, // Adicione 
      });
    } else {
      user = await prisma.user.findUnique({ 
        where: { username: identifier },
        select: { id: true, name: true, username: true, email: true, teamMembers: true }, // Adicione teamId
      });
    }

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    return reply.send(user);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Erro ao buscar usuário' });
  }
});

// Rota para criar equipes-ok
server.post("/team", 
  async (request, reply) => {
  try {
    const parts = request.parts();
    let teamImageUrl: string = "";
    let teamName: string = "";
    let members: number[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        // Converte o arquivo para buffer
        const buffer = await part.toBuffer();

        // Faz o upload para o Cloudinary
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "team_images", // Pasta onde as imagens serão armazenadas no Cloudinary
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        // Adiciona a URL da imagem
        teamImageUrl = result.secure_url;
        console.log("URL gerada para a imagem:", teamImageUrl);
      } else if (part.fieldname === "name") {
        teamName = typeof part.value === "string" ? part.value : String(part.value);
      } else if (part.fieldname === "members") {
        try {
          const parsedMembers = JSON.parse(String(part.value));
          if (Array.isArray(parsedMembers)) {
            members = parsedMembers.map((id) => Number(id));
          }
        } catch (err) {
          return reply.status(400).send({ error: "Formato de membros inválido." });
        }
      }
    }

    if (!teamName || members.length === 0) {
      return reply.status(400).send({ error: "Nome da equipe e membros são obrigatórios." });
    }

    // Criando a equipe no banco de dados
    const newTeam = await prisma.team.create({
      data: { name: teamName, imageUrl: teamImageUrl },
    });

    // Criando convites para os membros (exceto para o criador da equipe)
    const creatorId = members[0]; // Assumindo que o primeiro membro é o criador
    const membersToInvite = members.filter(id => id !== creatorId);

    // Criando convites para os membros
    const invitations = await prisma.teamInvitation.createMany({
      data: membersToInvite.map((userId) => ({
        teamId: newTeam.id,
        userId,
        status: 'PENDING', // Convite pendente
      })),
    });

    // Adiciona o criador como membro efetivo
    await prisma.teamMember.create({
      data: {
        teamId: newTeam.id,
        userId: creatorId,
      },
    });

    // Buscando dados dos membros atualizados (inclusive o criador)
    const updatedMembers = await prisma.user.findMany({
      where: { id: { in: members } },
      select: { id: true, name: true },
    });

    return reply.status(201).send({
      message: "Equipe criada com sucesso!",
      team: newTeam,
      members: updatedMembers,
      invitations, // Envia os convites criados como resposta
    });
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: "Falha ao criar equipe. Tente novamente." });
  }
});

server.get("/team-invitations/:userId", 
  async (request, reply) => {
  try {
    const { userId } = request.params as { userId: string };

    // Busca todos os convites pendentes para o usuário
    const invitations = await prisma.teamInvitation.findMany({
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
  } catch (error) {
    console.error("Erro ao buscar convites:", error);
    return reply.status(500).send({ error: "Erro ao buscar convites. Tente novamente." });
  }
});

// Rota para ceitar convite de equipe
server.post("/team/invite/:invitationId/:action", 
  async (request, reply) => {
  try {
    const { invitationId, action } = request.params as { invitationId: string, action: string };
    const { userId } = request.body as { userId: number }; // Pegando userId do corpo da requisição

    console.log('Dados recebidos:', { invitationId, action, userId });

    // Verificar se o convite existe e pertence ao usuário
    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: Number(invitationId) },
    });

    if (!invitation) {
      return reply.status(404).send({ error: "Convite não encontrado." });
    }

    if (invitation.userId !== userId) {
      return reply.status(403).send({ error: "Você não tem permissão para responder a este convite." });
    }

    // Verificar se o usuário já está em uma equipe
    const userTeam = await prisma.teamMember.findFirst({
      where: { userId: invitation.userId },
    });

    if (userTeam && action === 'accept') {
      return reply.status(400).send({ error: "Você já faz parte de uma equipe e não pode aceitar novos convites." });
    }

    // Se o convite for aceito, adicionar o usuário à equipe
    if (action === 'accept') {
      await prisma.teamMember.create({
        data: {
          teamId: invitation.teamId,
          userId: invitation.userId,
        },
      });

      // Atualizar status do convite para 'ACEITO'
      await prisma.teamInvitation.update({
        where: { id: Number(invitationId) },
        data: { status: 'ACCEPTED' },
      });

      return reply.status(200).send({ message: "Convite aceito, você foi adicionado à equipe." });
    }

    // Se o convite for rejeitado, deletar o convite
    if (action === 'reject') {
      await prisma.teamInvitation.delete({
        where: { id: Number(invitationId) },
      });

      return reply.status(200).send({ message: "Convite rejeitado." });
    }

    return reply.status(400).send({ error: "Ação inválida. Use 'accept' ou 'reject'." });
  } catch (err) {
    console.error("Erro ao processar convite:", err);
    return reply.status(500).send({ 
      error: "Falha ao processar convite. Tente novamente.",
      details: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Rota para adicionar corretor a equipe
server.post('/teams/:teamId/member', 
  async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { teamId } = request.params as { teamId: string };
    const { userId } = request.body as { userId: number };

    console.log(`Solicitação para convidar usuário ${userId} para a equipe ${teamId}`);

    // Verifica se a equipe existe
    const team = await prisma.team.findUnique({
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
    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: { teamId: parseInt(teamId), userId, status: 'PENDING' },
    });

    if (existingInvitation) {
      console.log('Usuário já foi convidado.');
      return reply.status(400).send({ error: 'Usuário já possui um convite pendente.' });
    }

    // Cria um convite para o usuário
    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId: parseInt(teamId),
        userId,
        status: 'PENDING', // Convite pendente
      },
    });

    console.log(`Convite enviado para o usuário ${userId}`);
    
    return reply.status(200).send({ message: 'Convite enviado com sucesso.', invitation });

  } catch (error) {
    console.error('Erro ao enviar convite:', error);
    return reply.status(500).send({ error: 'Erro ao enviar convite.' });
  }
});

// Rota para sair da equipe-ok
server.post('/teams/:teamId/leave', 
  async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { teamId } = request.params as { teamId: string };
    const { userId } = request.body as { userId: number };

    console.log(`Usuário ${userId} solicitou sair da equipe ${teamId}`);

    // Verifica se a equipe existe
    const team = await prisma.team.findUnique({
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
    await prisma.$transaction([
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
  } catch (error) {
    console.error('Erro ao deixar a equipe:', error);
    return reply.status(500).send({ error: 'Erro ao deixar a equipe.' });
  }
});

// Rota para editar equipe
server.put('/team/:id', 
  async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
  try {
    const teamId = parseInt(request.params.id);
    if (isNaN(teamId)) {
      return reply.status(400).send({ error: 'ID inválido.' });
    }

    const parts = request.parts();
    let teamImageUrl: string | undefined;
    let teamName: string | undefined;
    let members: number[] | undefined;

    console.log('🔄 Iniciando atualização da equipe...');

    for await (const part of parts) {
      console.log('📦 Processando parte:', part.fieldname);

      if (part.type === 'file') {
        console.log('🖼️ Recebendo novo arquivo de imagem:', part.filename);

        // Converte o arquivo para buffer
        const buffer = await part.toBuffer();

        // Faz o upload para o Cloudinary
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "team_images",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        teamImageUrl = result.secure_url;
        console.log('✅ Nova imagem enviada para Cloudinary:', teamImageUrl);

      } else if (part.fieldname === 'name') {
        teamName = typeof part.value === 'string' ? part.value : String(part.value);
        console.log('📛 Novo nome da equipe recebido:', teamName);
      } else if (part.fieldname === 'members') {
        try {
          const parsedMembers = JSON.parse(String(part.value));
          if (Array.isArray(parsedMembers)) {
            members = parsedMembers.map((id) => Number(id));
            console.log('👥 Novos membros recebidos:', members);
          }
        } catch (err) {
          console.error('❌ Erro ao processar membros:', err);
          return reply.status(400).send({ error: 'Formato de membros inválido.' });
        }
      }
    }

    // Verifica se a equipe existe
    const existingTeam = await prisma.team.findUnique({
      where: { id: teamId },
      select: { imageUrl: true }
    });

    if (!existingTeam) {
      console.error('❌ Erro: Equipe não encontrada.');
      return reply.status(404).send({ error: 'Equipe não encontrada.' });
    }

    console.log('🛠️ Atualizando equipe no banco de dados...');
    const updatedTeam = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: teamName ?? undefined, // Só atualiza se foi enviado
        imageUrl: teamImageUrl ?? undefined, // Só atualiza se foi enviado
      },
    });

    // Lógica para atualização de membros (mantida igual)
    if (members) {
      console.log('🔄 Atualizando membros da equipe...');

      // ... (restante da lógica de membros permanece igual)
    }

    console.log('✅ Equipe atualizada com sucesso!', updatedTeam);
    return reply.status(200).send({ 
      message: 'Equipe atualizada com sucesso!', 
      team: updatedTeam 
    });

  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('❌ Erro ao atualizar equipe:', error.message);
      return reply.status(500).send({ 
        error: 'Falha ao atualizar equipe.', 
        details: error.message 
      });
    } else {
      console.error('❌ Erro desconhecido:', error);
      return reply.status(500).send({ error: 'Erro ao atualizar equipe.' });
    }
  }
});

// Rota para remover membro da equipe
server.delete('/team/member/:teamId/:id', 
  async (request, reply) => {
  // Garantindo que os parâmetros são passados corretamente
  const { teamId, id } = request.params as { teamId: string, id: string };

  try {
    // Convertendo os parâmetros para número
    const teamIdNumber = parseInt(teamId);
    const userIdNumber = parseInt(id);

    // Verificando se a conversão foi bem-sucedida
    if (isNaN(teamIdNumber) || isNaN(userIdNumber)) {
      return reply.status(400).send({ error: 'ID ou teamId inválido.' });
    }

    // Verifica se o membro existe na equipe
    const teamMember = await prisma.teamMember.findUnique({
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
    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId: teamIdNumber,
          userId: userIdNumber,
        },
      },
    });

    return reply.status(200).send({ message: 'Corretor removido da equipe com sucesso.' });
  } catch (error) {
    console.error('Erro ao remover membro da equipe:', error);
    return reply.status(500).send({ error: 'Erro ao remover corretor da equipe.' });
  }
});

// Rota para ver uma equipe
server.get('/team/:id', 
  async (request: FastifyRequest<{ Params: Params }>, reply) => {
  try {
    const teamId = parseInt(request.params.id); // Convertendo id para número
    if (isNaN(teamId)) {
      return reply.status(400).send({ error: 'ID inválido.' });
    }

    const team = await prisma.team.findUnique({
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Erro ao buscar a equipe:', error.message);
      reply.status(500).send({ error: 'Erro ao buscar a equipe', details: error.message });
    } else {
      console.error('Erro desconhecido:', error);
      reply.status(500).send({ error: 'Erro ao buscar a equipe' });
    }
  }
});

// Rota para buscar todas as equipes
server.get('/teams', 
  async (request, reply) => {
  try {
    const teams = await prisma.team.findMany({
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
      const creatorId = team.teamMembers[0]?.userId; // Considera o primeiro membro como criador
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
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Erro ao buscar todas as equipes' });
  }
});

// Rota para deletar equipe
server.delete('/team/:id', 
  async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

    // Usando uma transação para garantir que todas as operações sejam executadas ou nenhuma
    await prisma.$transaction(async (prisma) => {
      // Primeiro, deletamos os convites pendentes
      await prisma.teamInvitation.deleteMany({
        where: { teamId: teamId },
      });

      console.log(`Convites da equipe ${teamId} excluídos.`);

      // Depois, deletamos os membros da equipe
      await prisma.teamMember.deleteMany({
        where: { teamId: teamId },
      });

      console.log(`Membros da equipe ${teamId} excluídos.`);

      // Por fim, deletamos a equipe
      await prisma.team.delete({
        where: { id: teamId },
      });
    });

    console.log(`Equipe com ID ${teamId} excluída com sucesso.`);
    reply.status(200).send({ message: 'Equipe deletada com sucesso.' });

  } catch (error: unknown) {
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
server.post('/messages', 
  async (request: FastifyRequest<{ Body: { senderId: number; receiverId: number; content: string } }>, reply: FastifyReply) => {
  const { senderId, receiverId, content } = request.body;

  // Validando os dados com Joi
  const { error } = messageSchema.validate({ senderId, receiverId, content });

  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  try {
    // Criando a nova mensagem
    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
    });

    return reply.status(201).send(newMessage);
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: 'Falha ao enviar a mensagem.' });
  }
});

// Rota para buscar mensagens entre dois usuários
server.get('/messages', 
  async (request: FastifyRequest, reply: FastifyReply) => {
  const { senderId, receiverId } = request.query as { senderId: string; receiverId: string };

  // Convertendo para número
  const senderIdNum = parseInt(senderId, 10);
  const receiverIdNum = parseInt(receiverId, 10);

  // Validar se senderId e receiverId são números
  if (isNaN(senderIdNum) || isNaN(receiverIdNum)) {
    return reply.status(400).send({ error: 'Os parâmetros senderId e receiverId precisam ser números válidos.' });
  }

  try {
    // Consultar mensagens entre senderId e receiverId
    const messages = await prisma.message.findMany({
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
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: 'Falha ao buscar as mensagens' });
  }
});

// Rota para buscar mensagens de um usuário específico
server.get('/messages/:userId', 
  async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
  const userId = parseInt(request.params.userId, 10);

  if (isNaN(userId)) {
    return reply.status(400).send({ error: 'ID inválido' });
  }

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { timestamp: 'asc' },
    });

    return reply.send(messages);
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: 'Falha ao buscar mensagens' });
  }
});

// Rota para buscar a lista de conversas únicas do usuário
server.get('/messages/conversations/:userId',
  async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
  const userId = parseInt(request.params.userId, 10);

  if (isNaN(userId)) {
    return reply.status(400).send({ error: 'ID inválido' });
  }

  try {
    // Buscar todas as conversas do usuário
    const conversations = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { timestamp: 'desc' }, // Ordenar por timestamp para pegar a última mensagem primeiro
    });

    // Usar um objeto para evitar duplicação de userId
    const uniqueConversations: Record<number, { userId: number; lastMessage: string; timestamp: Date }> = {};

    for (const message of conversations) {
      const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;

      // Se a conversa já foi processada, pule
      if (uniqueConversations[otherUserId]) continue;

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
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: 'Falha ao buscar conversas' });
  }
});

// Rota para adicionar imóveis
server.post("/property", 
  async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const parts = request.parts(); // Processa arquivos e campos multipart
    const imagensUrls: string[] = [];
    const formData: Record<string, string> = {};

    // Processar as partes da requisição
    for await (const part of parts) {
      if (part.type === "file") {
        // Converte o arquivo para buffer
        const buffer = await part.toBuffer();

        // Faz o upload para o Cloudinary
        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "property_images", // Pasta onde as imagens serão armazenadas no Cloudinary
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        // Adiciona a URL da imagem ao array de URLs
        imagensUrls.push(result.secure_url);
        console.log("URL gerada para a imagem:", result.secure_url);
      } else if (typeof part.value === "string") {
        // Adiciona os campos de texto ao formData
        formData[part.fieldname] = part.value;
      }
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
    const property = await prisma.property.create({
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
  } catch (err) {
    console.error("Erro ao criar imóvel:", err);
    return reply.status(500).send({ error: "Falha ao criar imóvel. Tente novamente." });
  }
});

// Rota para filtrar imoveis por id e teamId
server.get('/properties/filter', 
  async (request: FastifyRequest<{ Querystring: { userId: string; teamId?: string } }>, reply: FastifyReply) => {
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

    if (isNaN(userIdNumber) || (teamId && isNaN(teamIdNumber!))) {
      console.error("❌ userId ou teamId não são números válidos!");
      return reply.status(400).send({ error: "userId e teamId (se fornecido) devem ser números válidos" });
    }

    // Consulta ao banco de dados
    const properties = await prisma.property.findMany({
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
  } catch (error) {
    console.error("🔥 Erro ao buscar propriedades:", error);
    return reply.status(500).send({ error: "Erro ao buscar as propriedades" });
  }
});

// Rota para listar imóveis
server.get("/property",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const properties = await prisma.property.findMany({
        include: {
          images: {
            select: {
              url: true,  // Supondo que você tenha um campo `url` na tabela de imagens
            },
          },
          user: {  // Incluindo o usuário associado a cada imóvel
            select: {
              username: true, // Incluindo o nome do usuário
            },
          },
        },
      });

      // Aqui, se necessário, você pode mapear as imagens para garantir que cada imóvel tenha apenas as URLs das imagens
      const propertiesWithImages = properties.map((property) => ({
        ...property,
        images: property.images.map((image) => image.url),  // Apenas as URLs
      }));

      return reply.send(propertiesWithImages);
    } catch (error) {
      console.error("Erro ao buscar imóveis:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
  }
);

// Rota para listar imóveis do usuário
server.get('/property/user', 
  async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
    const { userId } = request.query;

    const numericUserId = Number(userId); // Converte userId para número

    if (isNaN(numericUserId)) {
      return reply.status(400).send({ error: 'UserId é obrigatório e deve ser um número' });
    }

    try {
      const properties = await prisma.property.findMany({
        where: { userId: numericUserId },
        include: { 
          images: true,  // Inclui as imagens associadas ao imóvel
          user: {  // Incluindo o usuário associado a cada imóvel
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
          // Verifica se a URL já contém o domínio do Cloudinary
          const imageUrl = image.url.startsWith('https://') ? image.url : `https://servercasaperto.onrender.com${image.url}`;
          return imageUrl; // Retorna a URL completa da imagem
        });

        return {
          ...property, // Mantém todas as informações do imóvel
          images: updatedImages, // Substitui as imagens pela URL completa
          username: property.user.username,  // Incluindo o nome do usuário
        };
      });

      return reply.send(propertiesUrl); // Retorna a lista de imóveis com URLs das imagens e o nome do usuário
    } catch (error) {
      console.error('Erro ao buscar imóveis do usuário:', error);
      return reply.status(500).send({ error: 'Falha ao buscar imóveis' });
    }
});

// Rota para obter detalhes de um imóvel específico
server.get("/property/:id", 
  async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  try {
    const { id } = request.params;

    if (isNaN(Number(id))) {
      return reply.status(400).send({ error: "ID inválido." });
    }

    const property = await prisma.property.findUnique({
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
  } catch (err) {
    console.error("Erro ao buscar imóvel:", err);
    return reply.status(500).send({ error: "Falha ao buscar imóvel. Tente novamente." });
  }
});

// Rota para editar imóveis
server.put("/property/:id", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const parts = request.parts(); // Processa arquivos e campos multipart
    const imagensUrls: string[] = [];
    const formData: Record<string, string> = {};

    // Processa os arquivos e campos de texto
    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();

        const result = await new Promise<any>((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: "property_images" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        imagensUrls.push(result.secure_url);
        console.log("Nova imagem upload:", result.secure_url);
      } else if (typeof part.value === "string") {
        formData[part.fieldname] = part.value;
      }
    }

    const { title, price, description, description1, latitude, longitude, category, existingImages } = formData;

    // Busca o imóvel existente
    const existingProperty = await prisma.property.findUnique({
      where: { id: Number(id) },
      include: { images: true },
    });

    if (!existingProperty) {
      return reply.status(404).send({ error: "Imóvel não encontrado." });
    }

    // Se `existingImages` for enviado, usamos ele para manter apenas essas imagens no banco
    const existingImagesArray: string[] = existingImages ? JSON.parse(existingImages) : [];

    // Identifica as imagens que devem ser removidas do banco
    const imagesToRemove = existingProperty.images.filter(
      (image) => !existingImagesArray.includes(image.url)
    );

    // Remove imagens que não estão na lista de imagens mantidas
    await prisma.image.deleteMany({
      where: { id: { in: imagesToRemove.map((image) => image.id) } },
    });

    // Atualiza os dados do imóvel
    const updatedProperty = await prisma.property.update({
      where: { id: Number(id) },
      data: {
        ...(title && { title }),
        ...(price && { price: Number(price) }),
        ...(description && { description }),
        ...(description1 && { description1 }),
        ...(latitude && { latitude: Number(latitude) }),
        ...(longitude && { longitude: Number(longitude) }),
        ...(category && { category: category[0].toUpperCase() + category.slice(1).toLowerCase() }),
        images: {
          create: imagensUrls.map((url) => ({ url })), // Adiciona apenas novas imagens
        },
      },
      include: { images: true },
    });

    return reply.status(200).send({
      message: "Imóvel atualizado com sucesso",
      property: updatedProperty,
    });
  } catch (err) {
    console.error("Erro ao atualizar imóvel:", err);
    return reply.status(500).send({ error: "Falha ao atualizar imóvel. Tente novamente." });
  }
});

// Rota para deletar um imóvel
server.delete("/property/:id",
  async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    const propertyId = Number(id);
    if (isNaN(propertyId)) {
      return reply
        .status(400)
        .send({ error: "ID do imóvel deve ser um número válido" });
    }

    try {
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { images: true },
      });

      if (!existingProperty) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      // Caminho para a pasta de uploads
      const uploadsDir = path.resolve(__dirname, "..", "uploads");

      // Remova os arquivos físicos das imagens associadas
      for (const image of existingProperty.images) {
        const imagePath = path.join(uploadsDir, image.url); // Certifique-se de que `filePath` é o campo correto no banco
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      await prisma.image.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });

      return reply.status(200).send({ message: "Imóvel deletado com sucesso" });
    } catch (error) {
      console.error("Erro ao deletar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao deletar imóvel" });
    }
  }
);

// Iniciar o servidor
const port = Number(process.env.PORT) || 3333;  // Converte a porta para número
server.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`Server listening at http://0.0.0.0:${port}`);
});


