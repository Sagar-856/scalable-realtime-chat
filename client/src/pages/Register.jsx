import { useState } from "react";
import API from "../services/api";
import { useNavigate } from "react-router-dom";



function Register() {

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = async (e) => {
    e.preventDefault();

    try {
        const res = await API.post("/auth/register", {
            name,
            email,
            password,
        });

        localStorage.setItem("token", res.data.token);

        navigate("/dashboard");

    } catch (err) {
        console.log(err.response.data);
    }
};
const navigate = useNavigate();

    return (
        <form onSubmit={handleSubmit}>
            <h1>Register</h1>

            <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e)=>setName(e.target.value)}
            />

            <br /><br />

            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
            />

            <br /><br />

            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
            />

            <br /><br />

            <button type="submit">
                Register
            </button>

        </form>
    );
}

export default Register;