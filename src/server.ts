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

const server = Fastify();
const prisma = new PrismaClient();
const client = new OAuth2Client('468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com');

server.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // Limita a quantidade de arquivos (5 no exemplo)
  },
});

const uploadsPath = path.join(__dirname, '../uploads');
// Registra o plugin para servir arquivos estáticos
server.register(fastifyStatic, {
  root: uploadsPath,
  prefix: '/uploads/', // URL base para acessar os arquivos
});

// Habilitar CORS
server.register(cors, {
  origin: "*", // Ajuste conforme necessário
});

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

// Rota de registro de usuários
server.post(
  "/users",
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

// Rota de login via usuário e senha
server.post(
  "/session",
  async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    const { error } = loginSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { username, password } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { username } });
      console.log("Usuário encontrado:", user);

      if (!user || !(await bcrypt.compare(password, user.password))) {
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
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return reply.status(500).send({ error: "Falha ao fazer login" });
    }
  }
);

// Rota de login com Google (ID Token)
server.post(
  "/google-login",
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

// Rota de buscar usuário por ID
server.get('/users/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const userId = Number(request.params.id); 

  if (isNaN(userId)) {
    return reply.status(400).send({ error: 'Invalid userId' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    return reply.send(user);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Failed to fetch user' });
  }
});

// Rota para adicionar imóveis
server.post("/property", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const parts = request.parts(); // Processa arquivos e campos multipart
    const imagensUrls: string[] = [];
    const formData: Record<string, string> = {};

    // Processar as partes da requisição
    for await (const part of parts) {
      if (part.type === "file") {
        // Garante que o nome do arquivo seja único usando timestamp
        const fileName = `${Date.now()}_${part.filename}`;
        const filePath = path.join("uploads", fileName); // Diretório 'uploads/'

        // Gera a URL pública que pode ser acessada
        const imageUrl = `/uploads/${fileName}`.replace(/\/+/g, "/"); // Elimina múltiplos "/"
        console.log("URL gerada:", imageUrl);
        // Faz o upload do arquivo para o diretório "uploads/"
        await pump(part.file, fs.createWriteStream(filePath));

        // Adiciona a URL da imagem ao array de URLs
        imagensUrls.push(imageUrl);
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

// Rota para listar imóveis
server.get(
  "/property",
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
server.get('/property/user', async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
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
        const imageUrl = `https://server-2-production.up.railway.app${image.url}`;
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

// Rota para deletar um imóvel
server.delete(
  "/property/:id",
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
server.listen({ port: 3333, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log("Server listening at http://0.0.0.0:3333");
});
