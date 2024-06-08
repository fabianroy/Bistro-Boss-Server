const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://agun-d6163.web.app",
    ]
}));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Bistro Boss Server is running');
});

const verifyToken = (req, res, next) => {
    console.log('Inside verify Token', req.headers);
    if (!req.headers.authorization) {
        return res.status(401).send('Unauthorized Request');
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log('Token verification failed', err);
            return res.status(401).send('Unauthorized Request');
        }
        req.decoded = decoded;
        next();
    });
}

// MongoDB connection setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@bistrocluster.dmvznhd.mongodb.net/?retryWrites=true&w=majority&appName=BistroCluster`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await userCollection.findOne(query);
    const isAdmin = user?.role === 'admin';
    if (!isAdmin) {
        return res.status(403).send('Unauthorized Request');
    }
    next();
}

async function run() {
    try {
        // await client.connect();

        global.userCollection = client.db("bistroDB").collection("Users");
        const menuCollection = client.db("bistroDB").collection("Menu");
        const reviewsCollection = client.db("bistroDB").collection("Reviews");
        const cartCollection = client.db("bistroDB").collection("Carts");
        const paymentCollection = client.db("bistroDB").collection("Payments");

        // JWT API
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '24h',
            });
            res.send({ token });
        });

        // Users routes
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send('Unauthorized Request');
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const admin = user ? user.role === 'admin' : false;
            res.send({ admin });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists' });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateUser = {
                $set: { role: 'admin' }
            };
            const result = await userCollection.updateOne(filter, updateUser);
            res.send(result);
        });

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // Menu routes
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.findOne(query);
            res.send(result);
        });

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menuItem = req.body;
            const result = await menuCollection.insertOne(menuItem);
            res.send(result);
        });

        app.put('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateItem = {
                $set: {
                    name: item.name,
                    price: item.price,
                    category: item.category,
                    recipe: item.recipe,
                }
            }
            const result = await menuCollection.updateOne(filter, updateItem);
            res.send(result);
        });


        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        });

        // Reviews routes
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        });

        // Carts routes
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // Payment Intent

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log('Amount:', amount);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'bdt',
                payment_method_types: ['card'],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // Payment API 

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send('Unauthorized Request');
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // carefully delete each cart item
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))

                }
            }
            const deleteResult = await cartCollection.deleteMany(query);
            res.send({ paymentResult, deleteResult });
        });

        // stats 
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const reviews = await reviewsCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            const customers = await userCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.amount, 0)

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$amount'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({ users, menuItems, reviews, orders, customers, revenue });
        });

        console.log("Connected to MongoDB!");
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
