require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// middleware 
app.use(cors(
    {
        origin: ['http://localhost:5173'],
        credentials: true
    }
));
app.use(express.json());
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rdxg6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db("guildDo");
        const userCollection = database.collection("users");
        const announcementCollection = database.collection("announcements");
        const postCollection = database.collection("posts");
        const commentCollection = database.collection("comments");
        const reportCollection = database.collection("reports");

        // JWT token
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: false,
                sameSite: 'strict'
            }).send({ success: true });
        });

        // Delete token
        app.post('/logout', async (req, res) => {
            res.clearCookie('token', { maxAge: 0 }).send({ success: true });
        });

        // custom middleware
        const verifyToken = async (req, res, next) => {
            const token = req?.cookies?.token;
            if (!token) {
                return res.status(401).send({ message: 'not authorized' })
            }

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized' })
                }
                req.user = decoded;
                next();
            });
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'Admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }


        //  Save User info
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        // get all user and specific user info
        app.get('/users', verifyToken, async (req, res) => {
            const user = req.query.email;
            let result;
            if (user) {
                result = await userCollection.findOne({ email: user });
            } else {
                result = await userCollection.find().toArray();
            }
            res.send(result);
        });

        // delete user
        app.delete('/users/:email', async (req, res) => {
            const userEmail = req.params.email;
            const query = { email: userEmail }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // make a user to Admin
        app.patch('/users/admin/:id', verifyToken, async (req, res) => {
            const userId = req.params.id;
            const query = { _id: new ObjectId(userId) }
            const updatedDoc = {
                $set: {
                    role: 'Admin'
                }
            };
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // Warn user
        app.patch('/users/warn/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
            const query = { email: userEmail }
            const updatedDoc = {
                $set: {
                    warn: 'Warning'
                }
            };
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        // add new announcement
        app.post('/announcements', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await announcementCollection.insertOne(data);
            res.send(result);
        });

        // get announcements
        app.get('/announcements', async (req, res) => {
            const result = await announcementCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // add new post
        app.post('/posts', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await postCollection.insertOne(data);
            res.send(result);
        });

        // get all post with pagination and user specific post
        app.get('/posts', async (req, res) => {
            const email = req.query.email;
            const searchValue = req.query.search;
            const limit = parseInt(req.query.limit);
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);

            let query = {}

            if (email) {
                query = { authorEmail: email }
            }

            if (typeof searchValue === 'string' && searchValue.trim() !== '') {
                    query.postTag= { $regex: searchValue, $options: "i" }
            }
            
            const cursor = postCollection.find(query).sort({ createdAt: -1 });
            if (limit) {
                cursor.limit(limit);
            } else {
                cursor.skip(page * size).limit(size);
            }

            const result = await cursor.toArray();
            res.send(result);
        });

        // app.get('/posts', async (req, res) => {
        //     const email = req.query.email;
        //     const limit = parseInt(req.query.limit);
        //     const page = parseInt(req.query.page);
        //     const size = parseInt(req.query.size);

        //     let query = {}

        //     if (email) {
        //         query = { authorEmail: email }
        //     }

            
        //     const cursor = postCollection.find(query).sort({ createdAt: -1 });
        //     if (limit) {
        //         cursor.limit(limit);
        //     } else {
        //         cursor.skip(page * size).limit(size);
        //     }

        //     const result = await cursor.toArray();
        //     res.send(result);
        // });


        // app.get('/posts', async (req, res) => {
        //     const email = req.query.email;
        //     const limit = parseInt(req.query.limit);
        //     let query = {}

        //     if (email) {
        //         query = { authorEmail: email }
        //     }

        //     const cursor = postCollection.find(query);
        //     if (limit) {
        //         cursor.limit(limit);
        //     }
        //     cursor.sort({ createdAt: -1 });

        //     const result = await cursor.toArray();
        //     res.send(result);
        // });

        /* Pagination */
        // app.get('/post', async (req, res) => {
        //     const page = parseInt(req.query.page);   
        //     const size = parseInt(req.query.size);  
        //     const result = await postCollection.find().skip(page * size).limit(size).toArray();
        //     res.send(result);
        // });

        // post count for pagination
        app.get('/postsCount', async (req, res) => {
            const count = await postCollection.estimatedDocumentCount();
            res.send({ count })
        })

        // get single post
        app.get('/posts/:id', async (req, res) => {
            const postId = req.params.id;
            const query = { _id: new ObjectId(postId) }
            const result = await postCollection.findOne(query);
            res.send(result);
        });

        // add comment
        app.post('/comments', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await commentCollection.insertOne(data);
            res.send(result);
        });

        // get all comments and post specific comments
        app.get('/comments', async (req, res) => {
            const title = req.query.title;
            let query = {}
            if (title) {
                query = { postTitle: title }
            }
            const cursor = commentCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        // delete comment
        app.delete('/comments/:id', async (req, res) => {
            const commentId = req.params.id;
            const query = { _id: new ObjectId(commentId) }
            const result = await commentCollection.deleteOne(query);
            res.send(result);
        });

        // add report
        app.post('/reports', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await reportCollection.insertOne(data);
            res.send(result);
        });

        // get all report
        app.get('/reports', verifyToken, async (req, res) => {
            const result = await reportCollection.aggregate([
                {
                    $addFields: {
                        commentIdObject: { $toObjectId: "$commentId" }
                    }
                },
                {
                    $lookup: {
                        from: 'comments',
                        localField: 'commentIdObject',
                        foreignField: '_id',
                        as: 'comment'
                    }
                },
                {
                    $unwind: "$comment"
                },
                {
                    $project: {
                        _id: 1,
                        report: 1,
                        commentId: "$comment._id",
                        comment: "$comment.comment",
                        commenterEmail: "$comment.email",
                        postId: "$comment.postId"
                    }
                }
            ]).toArray();
            res.send(result);
        });

        // get single report
        app.get('/report/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { commentId: id }
            const result = await reportCollection.findOne(query);
            if (result) {
                res.send({ match: true });
            } else {
                res.send({ match: false });
            }
        });

        // delete report
        app.delete('/reports/:id', async (req, res) => {
            const reportId = req.params.id;
            const query = { _id: new ObjectId(reportId) }
            const result = await reportCollection.deleteOne(query);
            res.send(result);
        });


        // up-vote and down-vote
        app.patch('/posts/:id', verifyToken, async (req, res) => {
            const postId = req.params.id;
            const { email, voteType } = req.body;

            const query = { _id: new ObjectId(postId) }
            const post = await postCollection.findOne(query);

            const alreadyUpVoted = post.votedBy?.upVotes?.includes(email);
            const alreadyDownVoted = post.votedBy?.downVotes?.includes(email);

            let updateState = {};
            if (voteType === 'upvote') {

                if (alreadyUpVoted) {
                    res.send({ message: "Already up voted" });
                    return;
                }

                if (alreadyDownVoted) {
                    updateState = {
                        $inc: { DownVote: -1, UpVote: 1 },
                        $pull: { 'votedBy.downVotes': email },
                        $push: { 'votedBy.upVotes': email }
                    }
                } else {
                    updateState = {
                        $inc: { UpVote: 1 },
                        $push: { 'votedBy.upVotes': email }
                    }
                }

            } else if (voteType === 'downvote') {

                if (alreadyDownVoted) {
                    res.send({ message: "Already down voted" });
                    return;
                }


                if (alreadyUpVoted) {
                    updateState = {
                        $inc: { UpVote: -1, DownVote: 1 },
                        $pull: { 'votedBy.upVotes': email },
                        $push: { 'votedBy.downVotes': email }
                    }
                } else {
                    updateState = {
                        $inc: { DownVote: 1 },
                        $push: { 'votedBy.downVotes': email }
                    }
                }
            }
            const result = await postCollection.updateOne(query, updateState);
            res.send(result);
        });


        // delete post
        app.delete('/posts/:id', async (req, res) => {
            const postId = req.params.id;
            const query = { _id: new ObjectId(postId) }
            const result = await postCollection.deleteOne(query);
            res.send(result);
        });

        // get document count
        app.get('/post-count', async (req, res) => {
            const user = req.query.user;
            const query = { authorEmail: user }
            const posts = await postCollection.countDocuments(query);
            res.send({ posts });
        });

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('GuildDo server running!');
});
app.listen(port, () => {
    console.log(`Server Running on port ${port}`)
});