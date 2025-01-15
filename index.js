require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
// middleware 
app.use(cors());
app.use(express.json());

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
        const postCollection = database.collection("posts");

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

        // get user info
        app.get('/users', async (req, res) => {
            const user = req.query.email;
            const query = { email: user }
            const result = await userCollection.findOne(query);
            res.send(result);
        });

        // add new post
        app.post('/posts', async (req, res) => {
            const data = req.body;
            const result = await postCollection.insertOne(data);
            res.send(result);
        });

        // get all post and user specific post
        app.get('/posts', async (req, res) => {
            const email = req.query.email;
            const limit = parseInt(req.query.limit);
            let query = {}

            if (email) {
                query = { authorEmail: email }
            }

            const cursor = postCollection.find(query);
            if (limit) {
                cursor.limit(limit);
            }
            cursor.sort({ createdAt: -1 });
            
            const result = await cursor.toArray();
            res.send(result);
        });

        // get single post
        app.get('/posts/:id', async (req, res) => {
            const postId = req.params.id;
            const query = { _id: new ObjectId(postId) }
            const result = await postCollection.findOne(query);
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