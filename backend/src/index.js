import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const port = process.env.PORT || 8080;
app.use(cors());
app.use(express.json());
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
//# sourceMappingURL=index.js.map