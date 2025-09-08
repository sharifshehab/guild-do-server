require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware 
app.use(cors(
    {
        origin: [
            'http://localhost:5173',
            'https://guild-do.web.app',
            'https://guild-do.firebaseapp.com'
        ],
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
        const tagCollection = database.collection("tags");
        const paymentCollection = database.collection("payments");
        const friendCollection = database.collection("friends");
        const groupCollection = database.collection("groups");

        // JWT token
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            }).send({ success: true });
        });

        // Delete token
        app.post('/logout', async (req, res) => {
            res.clearCookie('token', { maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict' }).send({ success: true });
        });



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
        app.get('/users/:currentEmail', verifyToken, async (req, res) => {
            const currentUser = req.params.currentEmail;
            const user = req.query.email;
            const searchValue = req.query.search;
            const page = parseInt(req.query.page) || 0;
            const size = parseInt(req.query.size) || 0;

            let query = { email: { $ne: currentUser } };

            if (typeof searchValue === 'string' && searchValue.trim() !== '') {
                    query.name= { $regex: searchValue, $options: "i" }
            }

            let result;
            
            if (user) {
                result = await userCollection.findOne({ email: user });
            } else {
                result = await userCollection.find(query)
                    .skip(page * size)
                    .limit(size)
                    .toArray();
            }
            res.send(result);
        });
        // user count for pagination
        app.get('/userCounts', verifyToken, async (req, res) => {
            const count = await userCollection.estimatedDocumentCount();
            res.send({ count })
        })
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
        // To check if a user is "admin or not"
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;

            if (userEmail !== req.user.email) {
                return res.status(400).send({ message: 'Bed Request' })
            }
            const query = { email: userEmail };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user.role === 'Admin';
            }
            res.send({ admin });
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
            const postLimit = parseInt(req.query.limit);
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const SortByPopularity = req.query.popularity === 'true';

            let query = {}
            if (email) {
                query = { authorEmail: email }
            }

            if (typeof searchValue === 'string' && searchValue.trim() !== '') {
                query.postTag = { $regex: searchValue, $options: "i" }
            }

            let result;

            if (SortByPopularity) {
                result = await postCollection.aggregate([
                    {
                        $addFields: {
                            voteDifference: { $subtract: ["$UpVote", "$DownVote"] }
                        }
                    },
                    {
                        $sort: { voteDifference: -1 }
                    },
                    { $skip: page * size },
                    { $limit: size }
                ]).toArray();
            } else {
                const cursor = postCollection.find(query).sort({ createdAt: -1 });
                if (postLimit) {
                    cursor.limit(postLimit);
                } else {
                    cursor.skip(page * size).limit(size);
                }
                result = await cursor.toArray();
            }

            res.send(result);
        });
        // post count for pagination
        app.get('/postsCount', async (req, res) => {
            const count = await postCollection.estimatedDocumentCount();
            res.send({ count })
        })
        // specific users post count for pagination
        app.get('/postCounts/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
            const query = { authorEmail: userEmail }
            const count = await postCollection.countDocuments(query);
            res.send({ count })
        })
        // get single post
        app.get('/posts/:id', async (req, res) => {
            const postId = req.params.id;
            const query = { _id: new ObjectId(postId) }
            const result = await postCollection.findOne(query);
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


        // add comment
        app.post('/comments', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await commentCollection.insertOne(data);
            res.send(result);
        });
        // get all comments and post specific comments
        app.get('/comments', async (req, res) => {
            const id = req.query.id;
            let query = {};
            if (id) {
                query = { postId: id };
            }
            const cursor = commentCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });
        // get comments of current user
        app.get('/comments/:email', async (req, res) => {
            const commentUser = req.params.email;
            const cursor = commentCollection.find(commentUser);
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
            let page = parseInt(req.query.page);
            let size = parseInt(req.query.size);

            page = isNaN(page) ? 0 : page;
            size = isNaN(size) ? 10 : size;

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
            ]).skip(page * size).limit(size).toArray();
            res.send(result);
        });
        // report count for pagination
        app.get('/reportCounts', verifyToken, async (req, res) => {
            const count = await reportCollection.estimatedDocumentCount();
            res.send({ count })
        })
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


        // add new tag
        app.post('/tags', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await tagCollection.insertOne(data);
            res.send(result);
        });
        // get all tags
        app.get('/tags', async (req, res) => {
            const cursor = tagCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });


        // get document count
        app.get('/document-count', verifyToken, async (req, res) => {
            const posts = await postCollection.estimatedDocumentCount();
            const comments = await commentCollection.estimatedDocumentCount();
            const users = await userCollection.estimatedDocumentCount();
            res.send({ posts, comments, users });
        });


        // stripe payments
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card",
                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // save payment data
        app.post('/payments', verifyToken, async (req, res) => {
            const data = req.body;
            const userEmail = data.email;
            const query = { email: userEmail }
            const updatedDoc = {
                $set: {
                    badge: 'Gold'
                }
            };
            const update = await userCollection.updateOne(query, updatedDoc);
            const result = await paymentCollection.insertOne(data);
            res.send(result);
        });
        // get all payment data and specific user payment data 
        app.get('/payments', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            let result;
            if (userEmail) {
                result = await paymentCollection.findOne({ email: userEmail });
            } else {
                result = await paymentCollection.find().toArray();
            }
            res.send(result);
        });

        
        // Create friend requests
        app.post('/friend-requests', async (req, res) => {
            const request = req.body;
            const existingRequest = await friendCollection.findOne({
                $or: [
                    { fromUser: request.fromUser, toUser: request.toUser },
                    { fromUser: request.toUser, toUser: request.fromUser }
                ]
            });
            if (existingRequest) {
                return res.send({ message: 'friend request already sent', insertedId: null })
            }
            const result = await friendCollection.insertOne(request);
            res.send(result);
        });
        // get all friend requests (received requests and send requests)
        app.get('/friend-requests', async (req, res) => {
            const receivedRequests = req.query.receivedRequests;
            const sendRequests = req.query.sendRequests;
            let result;
            if (receivedRequests) {
                result = await friendCollection
                        .find({ toUser: receivedRequests }) 
                        .toArray();   
            } else {
                result = await friendCollection
                        .find({ fromUser: sendRequests }) 
                        .toArray();   
            }
            res.send(result);
        });
        // accept or reject friend requests 
        app.patch('/friend-requests/:id',  async (req, res) => {
            const friendRequestId = req.params.id;
            const friendRequestResponse = req.body.requestResponse;
            const query = { _id: new ObjectId(friendRequestId) }
            const updatedRequestStatus = {
                $set: {
                    status: friendRequestResponse
                }
            };
            const result = await friendCollection.updateOne(query, updatedRequestStatus);
            res.send(result);
        });
        // get my friends
        app.get('/my-friends/:email', async (req, res) => {
            const userEmail = req.params.email;
            const result  = await friendCollection
                            .find({
                                $and: [
                                        { status: "accept" },
                                        {
                                            $or: [
                                                { fromUser: userEmail },
                                                { toUser: userEmail }
                                            ]   
                                        }
                                    ]
                            }) 
                            .toArray();
            res.send(result);
        });
        // delete friend request
        // app.delete('/friend-requests/:id', async (req, res) => {
        //     const friendRequestId = req.params.id;
        //     const query = { _id: new ObjectId(friendRequestId) }
        //     const result = await friendCollection.deleteOne(query);
        //     res.send(result);
        // });


        // Create new group
        app.post('/groups', async (req, res) => {
            const group = req.body;
            const existingGroup = await groupCollection.findOne({ name: group.name });
            if (existingGroup) {
                return res.send({ message: 'Group name already exist', insertedId: null })
            }
            
            // Insert group creator data into the document by default
            const groupCreator = {
                email: group.owner,
                role: "admin",
                joinedAt: group.createdAt
            };
            group.members = [groupCreator]

            const result = await groupCollection.insertOne(group);
            res.send(result);
        });
        // get all groups and specific owner's groups
        app.get('/groups', async (req, res) => {
            const groupOwner = req.query.groupOwner;
            let result;
            if (groupOwner) {
                result = await groupCollection
                        .find({ owner: groupOwner }) 
                        .toArray();   
            } else {
                result = await groupCollection
                        .find() 
                        .toArray();  
            }
            
            res.send(result);
        });
        // send group join request
        app.patch('/groups/:id',  async (req, res) => {
            const groupId = req.params.id;
            const joinRequest = req.body.email;
            const query = { _id: new ObjectId(groupId) }

            const group = await groupCollection.findOne(query); 
            if (!group) {
                return res.status(404).send({message: "Group not found!"})
            }
            const alreadyRequested = group.requests?.some(request => request.email === joinRequest); 
            const alreadyMember = group.members?.some(member => member.email === joinRequest); 
            if (alreadyRequested) {
                return res.status(404).send({ message: "Join request already sent" });
            }
            if (alreadyMember) {
                return res.status(404).send({ message: "You are already a member" });
            }

            // Puss "join Request Email" in to the group "requests array"
            const updatedRequest = {
                $push: {
                    requests: joinRequest
                }
            };
            const result = await groupCollection.updateOne(query, updatedRequest);
            res.send(result);
        });
        // get all the join "requests" and the "members" of a group
        app.get('/groups/request/:id', async (req, res) => {
            const groupId = req.params.id;
            const members = req.query.members;

            const query = { _id: new ObjectId(groupId) };
            let options
            if (members) {
                // Get all the group members
                options = { projection: {members: 1 , _id:0} };
            } else {
                // Get all the group "join requests"
                options = { projection: { requests: 1, _id: 0 } };
            }
            
            const result = await groupCollection.findOne(query, options);
            res.send(result);
        });
        // accept or reject group join request
        app.patch('/groups/response/:id',  async (req, res) => {
            const groupId = req.params.id;
            const { joinEmail, action } = req.body;
            
            const query = { _id: new ObjectId(groupId) }

            let updateRequest;
            if (action === 'accept') {
                updateRequest = {
                    $pull: { requests:  joinEmail  }, // remove email from the "requests array"
                    $push: {                         // insert email into the "members array"
                        members: {
                            joinEmail,
                            role: "member",
                            joinDate: new Date().toISOString()
                        }
                    }
                }
            }else if(action === 'reject') {
                updateRequest = {
                    $pull: { requests: joinEmail }, // remove email from the "requests array"
                }
            } else {
                return res.status(404).send({ message: "Action not allowed" });
            }

            const result = await groupCollection.updateOne(query, updateRequest);
            res.send(result);
        });
        // delete group
        app.delete('/groups/:id', async (req, res) => {
            const groupId = req.params.id;
            const { ownerEmail } = req.query;
            
            // Only group owner can delete the group
            const query = { _id: new ObjectId(groupId) }
            const group = await groupCollection.findOne(query); 
            if (group.owner !== ownerEmail) {
                return res.status(404).send({message: "Only group owner can delete this group"})
            }

            const result = await groupCollection.deleteOne(query);
            res.send(result);
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
    console.log(`GuildDo Server Running on port ${port}`)
});