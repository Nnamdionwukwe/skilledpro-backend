import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

const POST_INCLUDE = {
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      city: true,
      country: true,
      workerProfile: {
        select: { title: true, verificationStatus: true, avgRating: true },
      },
      hirerProfile: {
        select: { companyName: true },
      },
    },
  },
  reactions: {
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  },
  comments: {
    where: { parentId: null },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
        },
      },
      replies: {
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  },
  repostOf: {
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
        },
      },
    },
  },
  _count: { select: { comments: true, reactions: true, reposts: true } },
};

// GET /api/posts/feed — public feed
export const getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      isPublic: true,
      ...(type && type !== "ALL" && { type }),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.post.count({ where }),
    ]);

    // Attach current user's reaction if logged in
    const userId = req.user?.id;
    const enriched = posts.map((post) => ({
      ...post,
      myReaction: userId
        ? post.reactions.find((r) => r.userId === userId)?.type || null
        : null,
      reactionSummary: summariseReactions(post.reactions),
    }));

    return sendResponse(res, {
      data: {
        posts: enriched,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to fetch feed");
  }
};

// GET /api/posts/my — current user's posts
export const getMyPosts = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: req.user.id },
        include: POST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.post.count({ where: { authorId: req.user.id } }),
    ]);

    return sendResponse(res, {
      data: {
        posts: posts.map((p) => ({
          ...p,
          myReaction:
            p.reactions.find((r) => r.userId === req.user.id)?.type || null,
          reactionSummary: summariseReactions(p.reactions),
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch posts");
  }
};

// GET /api/posts/user/:userId — a specific user's public posts
export const getUserPosts = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: req.params.userId, isPublic: true },
        include: POST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.post.count({
        where: { authorId: req.params.userId, isPublic: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        posts: posts.map((p) => ({
          ...p,
          myReaction: req.user
            ? p.reactions.find((r) => r.userId === req.user.id)?.type || null
            : null,
          reactionSummary: summariseReactions(p.reactions),
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch user posts");
  }
};

// GET /api/posts/:id
export const getPost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        ...POST_INCLUDE,
        comments: {
          where: { parentId: null },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    role: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!post) return sendError(res, "Post not found", 404);

    // Increment view count
    await prisma.post.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } },
    });

    return sendResponse(res, {
      data: {
        post: {
          ...post,
          myReaction: req.user
            ? post.reactions.find((r) => r.userId === req.user.id)?.type || null
            : null,
          reactionSummary: summariseReactions(post.reactions),
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch post");
  }
};

// POST /api/posts — create post
export const createPost = async (req, res) => {
  try {
    const { content, type = "GENERAL", isPublic = true } = req.body;
    if (!content?.trim()) return sendError(res, "Content is required", 400);

    const images = [];
    if (req.files?.length > 0) {
      images.push(...req.files.map((f) => f.path));
    } else if (req.file) {
      images.push(req.file.path);
    }

    const post = await prisma.post.create({
      data: {
        authorId: req.user.id,
        content: content.trim(),
        images,
        type,
        isPublic: Boolean(isPublic),
      },
      include: POST_INCLUDE,
    });

    return sendResponse(res, {
      status: 201,
      message: "Post created",
      data: { post: { ...post, myReaction: null, reactionSummary: {} } },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to create post");
  }
};

// PUT /api/posts/:id
export const updatePost = async (req, res) => {
  try {
    const { content, type, isPublic } = req.body;
    const existing = await prisma.post.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return sendError(res, "Post not found", 404);
    if (existing.authorId !== req.user.id)
      return sendError(res, "Not your post", 403);

    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        ...(content && { content: content.trim() }),
        ...(type && { type }),
        ...(isPublic !== undefined && { isPublic: Boolean(isPublic) }),
      },
      include: POST_INCLUDE,
    });

    return sendResponse(res, { message: "Post updated", data: { post } });
  } catch (err) {
    return sendError(res, "Failed to update post");
  }
};

// DELETE /api/posts/:id
export const deletePost = async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return sendError(res, "Post not found", 404);
    if (post.authorId !== req.user.id && req.user.role !== "ADMIN") {
      return sendError(res, "Not authorised", 403);
    }

    await prisma.post.delete({ where: { id: req.params.id } });
    return sendResponse(res, { message: "Post deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete post");
  }
};

// POST /api/posts/:id/repost
export const repost = async (req, res) => {
  try {
    const { content = "" } = req.body;
    const original = await prisma.post.findUnique({
      where: { id: req.params.id },
    });
    if (!original) return sendError(res, "Post not found", 404);

    const newPost = await prisma.post.create({
      data: {
        authorId: req.user.id,
        content: content.trim(),
        type: "GENERAL",
        isPublic: true,
        repostOfId: req.params.id,
      },
      include: POST_INCLUDE,
    });

    // Notify original author
    if (original.authorId !== req.user.id) {
      const reposter = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      await prisma.notification.create({
        data: {
          userId: original.authorId,
          title: "Your post was reposted",
          body: `${reposter.firstName} ${reposter.lastName} reposted your post.`,
          type: "POST_REPOST",
          data: { postId: original.id, repostId: newPost.id },
        },
      });
    }

    return sendResponse(res, {
      status: 201,
      message: "Reposted",
      data: { post: { ...newPost, myReaction: null, reactionSummary: {} } },
    });
  } catch (err) {
    return sendError(res, "Failed to repost");
  }
};

// POST /api/posts/:id/react
export const reactToPost = async (req, res) => {
  try {
    const { type = "LIKE" } = req.body;
    const validTypes = ["LIKE", "LOVE", "INSIGHTFUL", "CELEBRATE", "SUPPORT"];
    if (!validTypes.includes(type))
      return sendError(res, "Invalid reaction type", 400);

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return sendError(res, "Post not found", 404);

    const existing = await prisma.postReaction.findUnique({
      where: { postId_userId: { postId: req.params.id, userId: req.user.id } },
    });

    let reaction;
    if (existing) {
      if (existing.type === type) {
        // Toggle off — remove reaction
        await prisma.postReaction.delete({ where: { id: existing.id } });
        return sendResponse(res, {
          message: "Reaction removed",
          data: { reaction: null },
        });
      }
      // Change reaction type
      reaction = await prisma.postReaction.update({
        where: { id: existing.id },
        data: { type },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      });
    } else {
      reaction = await prisma.postReaction.create({
        data: { postId: req.params.id, userId: req.user.id, type },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      });

      // Notify post author
      if (post.authorId !== req.user.id) {
        const reactor = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { firstName: true, lastName: true },
        });
        await prisma.notification.create({
          data: {
            userId: post.authorId,
            title: "Someone reacted to your post",
            body: `${reactor.firstName} ${reactor.lastName} reacted with ${type.toLowerCase()} to your post.`,
            type: "POST_REACTION",
            data: { postId: post.id, reactionType: type },
          },
        });
      }
    }

    return sendResponse(res, { message: "Reaction saved", data: { reaction } });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to react");
  }
};

// GET /api/posts/:id/reactions
export const getReactions = async (req, res) => {
  try {
    const { type } = req.query;
    const reactions = await prisma.postReaction.findMany({
      where: {
        postId: req.params.id,
        ...(type && { type }),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            workerProfile: { select: { title: true } },
            hirerProfile: { select: { companyName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = summariseReactions(reactions);

    return sendResponse(res, {
      data: { reactions, summary, total: reactions.length },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch reactions");
  }
};

// POST /api/posts/:id/comments
export const addComment = async (req, res) => {
  try {
    const { content, parentId } = req.body;
    if (!content?.trim())
      return sendError(res, "Comment content required", 400);

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return sendError(res, "Post not found", 404);

    if (parentId) {
      const parent = await prisma.postComment.findUnique({
        where: { id: parentId },
      });
      if (!parent) return sendError(res, "Parent comment not found", 404);
    }

    const comment = await prisma.postComment.create({
      data: {
        postId: req.params.id,
        authorId: req.user.id,
        content: content.trim(),
        parentId: parentId || null,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
      },
    });

    // Notify post author
    if (post.authorId !== req.user.id) {
      const commenter = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          title: "New comment on your post",
          body: `${commenter.firstName} ${commenter.lastName} commented: "${content.slice(0, 60)}${content.length > 60 ? "..." : ""}"`,
          type: "POST_COMMENT",
          data: { postId: post.id, commentId: comment.id },
        },
      });
    }

    return sendResponse(res, {
      status: 201,
      message: "Comment added",
      data: { comment },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to add comment");
  }
};

// GET /api/posts/:id/comments
export const getComments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [comments, total] = await Promise.all([
      prisma.postComment.findMany({
        where: { postId: req.params.id, parentId: null },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true,
            },
          },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.postComment.count({
        where: { postId: req.params.id, parentId: null },
      }),
    ]);

    return sendResponse(res, {
      data: {
        comments,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch comments");
  }
};

// DELETE /api/posts/comments/:commentId
export const deleteComment = async (req, res) => {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment) return sendError(res, "Comment not found", 404);
    if (comment.authorId !== req.user.id && req.user.role !== "ADMIN") {
      return sendError(res, "Not authorised", 403);
    }
    await prisma.postComment.delete({ where: { id: req.params.commentId } });
    return sendResponse(res, { message: "Comment deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete comment");
  }
};

// Helper
function summariseReactions(reactions) {
  return reactions.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});
}
