import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function Login() {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const res = await API.post("/auth/login", {
                email,
                password,
            });

            localStorage.setItem("token", res.data.token);

            navigate("/dashboard");

        } catch (err) {
            console.log(err.response.data);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <h1>Login</h1>

            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <br /><br />

            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <br /><br />

            <button type="submit">Login</button>

        </form>
    );
}

export default Login;