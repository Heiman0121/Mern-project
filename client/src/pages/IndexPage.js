import Post from "../Post";
import { useEffect, useState } from "react";

export default function IndexPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(process.env.REACT_APP_SERVER_URL + "/post").then(
      (response) => {
        response.json().then((posts) => {
          setPosts(posts);
          setLoading(false);
        });
      },
    );
  }, []);

  return (
    <div>
      {loading ? (
        <div className="loading">
          Loading...
          <span>Render server is slow!</span>
          <p>Please wait a second</p>
        </div>
      ) : (
        posts.length > 0 &&
        posts.map((post, _id) => (
          <Post {...post} key={_id} />
        ))
      )}
    </div>
  );
}
